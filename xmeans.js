//Import confini

var Confini = ee.FeatureCollection("users/randomthingsfromw/Confini");
Map.addLayer(Confini, {color: 'blue'}, 'Confini');

//Import immagine (data e luogo)
var image = ee.ImageCollection (Sentinel2)
.filterDate('2019-03-23','2019-03-25')
.filterBounds(Confini);

Map.addLayer(image,{},'Immagine Sentinel 2 Margherita di Savoia');

Map.centerObject(Confini,10);
Map.addLayer(Confini,{color: '#f80000'},'Confini Margherita di Savoia', true, 0.3);

var ImmagineMedia = image.mosaic().clip(Confini);
Map.addLayer(ImmagineMedia,{},'Immagine (No Cloud Masking)');

//Cloud Masking: vado a rimuovere i pixel nuvolosi dall'immagine, restituendo in output la stessa immagine, ma priva di tali pixel.

var maskcloud1 = function(ImmagineMedia) {
  var QA60 = ImmagineMedia.select(['QA60']).toUint16();;
  var clouds = QA60.bitwiseAnd(1<<10).or(QA60.bitwiseAnd(1<<11));//fornisce i pixel nuvolosi
  return ImmagineMedia.updateMask(clouds.not()); // rimuove le nuvole (pixel nuvolosi) dall'Immagine
};

var ImmagineMediaSenzaNuvole = maskcloud1(ImmagineMedia).clip(Confini);

var ImmagineMedia = ImmagineMediaSenzaNuvole
Map.addLayer(ImmagineMedia, {}, 'Immagine (Con Cloud Masking)');

//Clustering unsupervised

// Creazione dataset di training

var bande = ['B1','B2','B3','B4','B5','B6','B7','B8','B8A','B9','B11','B12'] //Introdotta per risolvere l'errore "no data was found in training input
var training = ImmagineMedia.select(bande).sample({
  region: Confini,
  scale: 10,
  numPixels: 1000
});

print('Numero di pixel campionati X-Means:', training.size());

//CLUSTERER X-MEANS

var XMEANS = ee.Clusterer.wekaXMeans(4, 5).train(training);
var resultXMEANS = ImmagineMedia.cluster(XMEANS);

// Display the clusters with random colors.
Map.addLayer(resultXMEANS.randomVisualizer(), {}, 'Clusters X-MEANS');

//X-MEANS individua, per numero di cluster = 5, le seguenti classi (banda cluster):
// Cluster 0: Vegetation
// Cluster 1: Built-Up
// Cluster 2: Bare Soil
// Cluster 3: Saline
// Cluster 4: Sea

//Vado a creare una nuova immagine, rinominando la banda cluster in constant, assegnando le seguenti classi e la corrispondente palette:

//Saline(1)+Sea(2)+BuiltUp(3)+Vegetation(4)+BareSoil(5)

// 0 --> 4, 1 --> 3, 2 --> 5, 3 --> 1, 4 --> 2
var classificazioneXMEANS = resultXMEANS.select('cluster')
  .where(resultXMEANS.eq(0), 4)
  .where(resultXMEANS.eq(1), 3)
  .where(resultXMEANS.eq(2), 5)
  .where(resultXMEANS.eq(3), 1)
  .where(resultXMEANS.eq(4), 2)
  .rename('constant');

Map.addLayer(classificazioneXMEANS, {min: 0, max: 5, palette: ['black', '#e6a0c4', '#1f4e79','#8b2e2e','#4caf50','#d2b48c']}, 'Mappa LULC X-means Margherita di Savoia Marzo 2019');

//Export Mappa LULC X-Means

var MappaLULCXMeans = classificazioneXMEANS.select(['constant']);

Export.image.toDrive({
  image: MappaLULCXMeans.clip(Confini),
  folder: "MappaLULCXMeansMarzo2019",
  description: ' MappaLULCXMeansMargheritadiSavoiaMarzo2019',
  scale:10,
  region: Confini
  
});

//VERIFICA ACCURATEZZA X-MEANS
//Generazione punti casuali su Clusterer X-MEANS
var numPointsPerClass = 125;


function samplePoints(classValue, numPoints, seedValue) {
  return classificazioneXMEANS.updateMask(classificazioneXMEANS.eq(classValue)).stratifiedSample({
    numPoints: numPointsPerClass,
    classBand: 'constant', //è la banda della classificazione k-means, contenente i valori 1, 2, 3, 4 ,5 delle rispettive classi: saline, water, built-up, vegetation, bare soil
    region: Confini,
    scale: 10,
    classValues: [classValue],
    classPoints: [numPointsPerClass],
    seed: 0,
    geometries: true
  });
}

// Campionamento punti casuali su classificazione X-MEANS

var pointsSaline = samplePoints(1);
var pointsWater = samplePoints(2);
var pointsBuiltUp = samplePoints(3);
var pointsVegetation = samplePoints(4);
var pointsBareSoil = samplePoints(5);

// Unione dei punti casuali ed esportazione in formato GEOJSON

var randomPoints = pointsSaline.merge(pointsWater).merge(pointsBuiltUp).merge(pointsVegetation).merge(pointsBareSoil);

Map.addLayer(randomPoints, {color: 'red'}, 'Punti Casuali X-Means');

print('Numero di punti casuali "Saline":', pointsSaline.size());
print('Numero di punti casuali "Water":', pointsWater.size());
print('Numero di punti casuali "Built-Up:', pointsBuiltUp.size());
print('Numero di punti casuali "Vegetation:', pointsVegetation.size());
print('Numero di punti casuali "Bare Soil:', pointsBareSoil.size());
print('Numero di punti casuali totale:', randomPoints.size());

Export.table.toDrive({
  collection: randomPoints,
  folder: "XMEANSMarzo2019",
  description: '125PuntiRandomiciXmeansMarzo2019',
  fileFormat: 'GeoJSON'
});

// Import punti casuali corretti in QGIS (fotointerpretazione) 

var punticorretti = PuntiValidazioneXmeansMarzo2019;
Map.addLayer(punticorretti, {color: 'yellow'}, 'Punti Validazione X-means');

//Verifica accuratezza CLASSIFICAZIONE X-MEANS

var campionamentopunticorretti = classificazioneXMEANS.sampleRegions({
  collection: punticorretti,
  properties: ['correzione'], //Nome campo punti corretti in QGIS (modificato da constant a correzione - passaggio fondamentale. Sistema di riferimento non alterato.)
  scale: 10,
  geometries: true
});

var confusionMatrix = campionamentopunticorretti.errorMatrix('correzione', 'constant');

print('Matrice di confusione - CLASSIFICAZIONE X-MEANS Completa:', confusionMatrix);

var overallAccuracy = confusionMatrix.accuracy();
print('Overall Accuracy - CLASSIFICAZIONE X-MEANS Completa:', overallAccuracy);

var userAccuracy = confusionMatrix.consumersAccuracy();
var producerAccuracy = confusionMatrix.producersAccuracy();
print('User Accuracy - CLASSIFICAZIONE X-MEANS Completa:', userAccuracy);
print('Producer Accuracy - CLASSIFICAZIONE X-MEANS Completa:', producerAccuracy);

print('Kappa statistic - CLASSIFICAZIONE X-MEANS Completa:', confusionMatrix.kappa());

//Export Immagine RGB

var sceneRGB = ImmagineMedia.select(['B4_mean','B3_mean','B2_mean']);

var imageRGB = sceneRGB.visualize({
  bands: ["B4_mean","B3_mean","B2_mean"],
  gamma: 1,
  max: 1914.6517702096826,
  min: -440.9868175982691,
  opacity: 1
});

Export.image.toDrive({
  image: imageRGB.clip(Confini),
  folder: "RGBUnsupervisedMarzo2019",
  description: ' ImmagineRGBMargheritadiSavoiaMarzo2019',
  scale:10,
  region: Confini
  
});

//EXPORT CLASSIFICAZIONE K-MEANS

var sceneclassifKMEANS = classificazioneXMEANS.select(['constant']);
var imageclassifKMEANS = sceneclassifKMEANS.visualize({
 bands: ["constant"],
 gamma: 1,
 max: 5,
 min: 0,
 opacity: 1
});

Export.image.toDrive({
  image: imageclassifKMEANS.clip(Confini),
  folder: "KMEANSMarzo2019",
  description: ' ImmagineClassificazioneKMEANSCompletaMargheritaDiSavoiaMarzo2019',
  scale:10,
  region: Confini
});

//EXPORT CLASSIFICAZIONE X-MEANS

var sceneclassifXMEANS = classificazioneXMEANS.select(['constant']);

var imageclassifXMEANS = sceneclassifXMEANS.visualize({
 bands: ["constant"],
 gamma: 1,
 max: 5,
 min: 0,
 opacity: 1
});

Export.image.toDrive({
  image: imageclassifXMEANS.clip(Confini),
  folder: "XMEANSMarzo2019",
  description: ' ImmagineClassificazioneXMEANSCompletaMargheritaDiSavoiaMarzo2019',
  scale:10,
  region: Confini
});
