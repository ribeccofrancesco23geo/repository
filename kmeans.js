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
Map.addLayer(ImmagineMedia,{},'Immagine(No Cloud Masking)');

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

print('Numero di pixel campionati K-Means:', training.size());

//CLUSTERER KMeans

// Instantiate the clusterer and train it.

var KMEANS = ee.Clusterer.wekaKMeans(5).train(training); //In parentesi il numero di cluster  (classi)

// Cluster the input using the trained clusterer.
var resultKMEANS = ImmagineMedia.cluster(KMEANS).clip(Confini);

// Display the clusters with random colors.
Map.addLayer(resultKMEANS.randomVisualizer(), {}, 'Clusters K-MEANS');

//K-MEANS individua, per numero di cluster = 5, le seguenti classi (banda cluster):
// Cluster 0: Bare-soil
// Cluster 1: Built up
// Cluster 2: Saline
// Cluster 3: Sea
// Cluster 4: Vegetation

//Creo una nuova immagine, rinominando la banda cluster in constant, assegnando le seguenti classi e la corrispondente palette:

//Saline(1)+Sea(2)+BuiltUp(3)+Vegetation(4)+BareSoil(5)

// 0 --> 5, 1 --> 3, 2 --> 1, 3 --> 2, 4 --> 4
var classificazioneKMEANS = resultKMEANS.select('cluster')
  .where(resultKMEANS.eq(0), 5)
  .where(resultKMEANS.eq(1), 3)
  .where(resultKMEANS.eq(2), 1)
  .where(resultKMEANS.eq(3), 2)
  .where(resultKMEANS.eq(4), 4)
  .rename('constant');

Map.addLayer(classificazioneKMEANS, {min: 0, max: 5, palette: ['black', '#e6a0c4', '#1f4e79','#8b2e2e','#4caf50','#d2b48c']}, 'Mappa LULC K-means Margherita di Savoia Marzo 2019');

//Export Mappa LULC K-Means

var MappaLULCKMeans = classificazioneKMEANS.select(['constant']);

Export.image.toDrive({
  image: MappaLULCKMeans.clip(Confini),
  folder: "MappaLULCKMeansMarzo2019",
  description: ' MappaLULCKMeansMargheritadiSavoiaMarzo2019',
  scale:10,
  region: Confini
  
});

//VERIFICA ACCURATEZZA K-MEANS

//Generazione punti casuali su Clusterer K-MEANS

var numPointsPerClass = 125;

function samplePoints(classValue, numPoints, seedValue) {
  return classificazioneKMEANS.updateMask(classificazioneKMEANS.eq(classValue)).stratifiedSample({
    numPoints: numPointsPerClass,
    classBand: 'constant', //è la banda della classificazione k-means, contenente i valori 1, 2, 3, 4 ,5 delle rispettive classi: saline, sea, built-up, vegetation, bare soil
    region: Confini,
    scale: 10,
    classValues: [classValue],
    classPoints: [numPointsPerClass],
    seed: 0,
    geometries: true
  });
}

// Campionamento punti casuali su classificazione K-means

var pointsSaline = samplePoints(1);
var pointsWater = samplePoints(2);
var pointsBuiltUp = samplePoints(3);
var pointsVegetation = samplePoints(4);
var pointsBareSoil = samplePoints(5);


// Unione dei punti casuali ed esportazione in formato GEOJSON

var randomPoints = pointsSaline.merge(pointsWater).merge(pointsBuiltUp).merge(pointsVegetation).merge(pointsBareSoil);

Map.addLayer(randomPoints, {color: 'red'}, 'Punti Casuali K-Means');

print('Numero di punti casuali "Saline":', pointsSaline.size());
print('Numero di punti casuali "Water":', pointsWater.size());
print('Numero di punti casuali "Built-Up:', pointsBuiltUp.size());
print('Numero di punti casuali "Vegetation:', pointsVegetation.size());
print('Numero di punti casuali "Bare Soil:', pointsBareSoil.size());
print('Numero di punti casuali totale:', randomPoints.size());

Export.table.toDrive({
  collection: randomPoints,
  folder: "KMEANSMarzo2019",
  description: '125PuntiRandomiciKmeansMarzo2019',
  fileFormat: 'GeoJSON'
});

// Import punti casuali corretti in QGIS (fotointerpretazione)

var punticorretti = PuntiValidazioneKmeans;
Map.addLayer(punticorretti, {color: 'yellow'}, 'Punti Validazione K-MEANS');

//Verifica accuratezza CLASSIFICAZIONE K-MEANS

var campionamentopunticorretti = classificazioneKMEANS.sampleRegions({
  collection: punticorretti,
  properties: ['correzione'], //Nome campo punti corretti in QGIS (modificato da constant a correzione - passaggio fondamentale. Sistema di riferimento non alterato.)
  scale: 10,
  geometries: true
});

var confusionMatrix = campionamentopunticorretti.errorMatrix('correzione', 'constant');

print('Matrice di confusione - CLASSIFICAZIONE K-MEANS Completa:', confusionMatrix);

var overallAccuracy = confusionMatrix.accuracy();
print('Overall Accuracy - CLASSIFICAZIONE K-MEANS Completa:', overallAccuracy);

var userAccuracy = confusionMatrix.consumersAccuracy();
var producerAccuracy = confusionMatrix.producersAccuracy();
print('User Accuracy - CLASSIFICAZIONE K-MEANS Completa:', userAccuracy);
print('Producer Accuracy - CLASSIFICAZIONE K-MEANS Completa:', producerAccuracy);

print('Kappa statistic - CLASSIFICAZIONE K-MEANS Completa:', confusionMatrix.kappa());
