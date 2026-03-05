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

//INDEX 

//SWIRED
var RED = ImmagineMedia.select("B4");
var SWIR1 = ImmagineMedia.select("B11");
var SWIRED = ImmagineMedia.expression(('(SWIR1-RED)/(SWIR1+RED)'),
{'SWIR1':SWIR1,
'RED': RED
});
Map.addLayer(SWIRED.clip(Confini),{},'SWIRED Margherita di Savoia Marzo 2019');

//Export SWIREDMANUALE1

var swiredmanuale1 = SWIRED.select(['B11']);

Export.image.toDrive({
  image: swiredmanuale1.clip(Confini),
  folder: "OTSUManualeMarzo2019",
  description: ' SwiredManuale1MargheritadiSavoiaMarzo2019',
  scale:10,
  region: Confini
  
});

// Minimo e massimo valore SWIRED (inserito in istogramma)

var minmax = SWIRED.reduceRegion({
  geometry:Confini,
  reducer: ee.Reducer.minMax(),
  scale:10,
  bestEffort:true
});

print(minmax,'MINIMI E MASSIMI VALORI SWIRED');

var minimoSWIRED = minmax.get('B11_min');
var massimoSWIRED = minmax.get('B11_max');

//Istogramma SWIRED Index Margherita di Savoia

var chartSWIRED = ui.Chart.image.histogram ({image:SWIRED,region:Confini,scale:10,maxPixels:30402668});
print(chartSWIRED,'Istogramma SWIRED Margherita di Savoia Marzo 2019');

// Soglia per distinguere Mare + Saline

var threshold_swired = 0.05;

print('Threshold Separazione Manuale Mare/Saline  su SWIRED',threshold_swired );

var waterSalineMask = SWIRED.lte(threshold_swired);

// Maschera Mare + Saline

var maskedCollection = ImmagineMedia.updateMask(waterSalineMask);
Map.addLayer(waterSalineMask.selfMask().clip(Confini), {palette: ['0000FF']}, 'Separazione Superfici acquatiche/Saline');

//Seleziono i pixel Saline/Superfici acquatiche sui quali calcolare SEA Index

var watersaline = function(ImmagineMedia) {
  return ImmagineMedia.updateMask(waterSalineMask);
};

var ImmagineMediaWaterSaline = watersaline(ImmagineMedia).clip(Confini);
Map.addLayer(ImmagineMediaWaterSaline, {}, 'Immagine Water/Saline');

// Indice di separazione Mare - Saline (SEA Index)

var RE1 = ImmagineMediaWaterSaline.select("B5");
var GREEN = ImmagineMediaWaterSaline.select("B3");
var RED = ImmagineMediaWaterSaline.select("B4");

var SEAIndex = ImmagineMediaWaterSaline.expression(('(RED+RE1)/(GREEN)'),
{'RE1':RE1,
'RED': RED,
'GREEN':GREEN
});

Map.addLayer(SEAIndex.clip(Confini),{},'SEA Index Margherita di Savoia Marzo 2019');

//Export SEAINDEXMANUALE1

var seaindexmanuale1 = SEAIndex.select(['B4']);

Export.image.toDrive({
  image: seaindexmanuale1.clip(Confini),
  folder: "OTSUManualeMarzo2019",
  description: ' SeaINDEXManuale1MargheritadiSavoiaMarzo2019',
  scale:10,
  region: Confini
  
});

//Minimo e massimo valore Indice di separazione acqua - mare (SEA Index) (Inserito in istogramma)

var minmax = SEAIndex.reduceRegion({
  geometry:Confini,
  reducer: ee.Reducer.minMax(),
  scale:10,
  bestEffort:true
});

print(minmax,'MINIMI E MASSIMI VALORI SEA Index');

var minimoSEAIndex = minmax.get('B4_min');
var massimoSEAIndex = minmax.get('B4_max');

//Istogramma SEA Index Margherita di Savoia

var chartSEAIndex = ui.Chart.image.histogram ({image:SEAIndex,region:Confini,scale:10,maxPixels:30402668});
print(chartSEAIndex,'Istogramma SEA Index Margherita di Savoia Marzo 2019');

// Soglia per distinguere saline dal mare

var threshold_SEAIndex = 0.90;

print('Threshold Separazione Manuale Saline su SEA Index', threshold_SEAIndex);

var SalineMask = SEAIndex.gte(threshold_SEAIndex);

var WaterMask = SEAIndex.lt(threshold_SEAIndex);

// Maschera saline

var salineMasked = waterSalineMask.updateMask(SalineMask);

// Maschera water

var WaterMasked = waterSalineMask.updateMask(WaterMask);

//Print Maschera Saline e Maschera Water

Map.addLayer(salineMasked.selfMask().clip(Confini), {palette: ['#e6a0c4']}, 'Separazione Saline');
Map.addLayer(WaterMasked.selfMask().clip(Confini), {palette: ['#1f4e79']}, 'Separazione Superfici acquatiche');

var nowaternosaline = function(ImmagineMedia) {
  return ImmagineMedia.updateMask(waterSalineMask.not());
};

var ImmagineMediaNoSalineNoWater = nowaternosaline(ImmagineMedia).clip(Confini);
Map.addLayer(ImmagineMediaNoSalineNoWater, {}, 'Immagine No Water/No Saline');

//Su ImmagineMediaNoSalineNoWater vado ad applicare indici per estrarre prima di tutto il built-up tramite SWIRED

//ESTRAZIONE BUILT-UP (SWIRED)

//SWIRED

var RED = ImmagineMediaNoSalineNoWater.select("B4");
var SWIR1 = ImmagineMediaNoSalineNoWater.select("B11");
var SWIREDBuiltUp = ImmagineMediaNoSalineNoWater.expression(('(SWIR1-RED)/(SWIR1+RED)'),
{'SWIR1':SWIR1,
'RED': RED
});

//Export SWIREDMANUALE2

var swiredmanuale2 = SWIREDBuiltUp.select(['B11']);
Export.image.toDrive({
  image: swiredmanuale2.clip(Confini),
  folder: "OTSUManualeMarzo2019",
  description: ' SwiredManuale2MargheritadiSavoiaMarzo2019',
  scale:10,
  region: Confini
  
});

// Minimo e massimo valore SWIREDBuiltUp

var minmax = SWIREDBuiltUp.reduceRegion({
  geometry:Confini,
  reducer: ee.Reducer.minMax(),
  scale:10,
  bestEffort:true
});

print(minmax,'MINIMI E MASSIMI VALORI SWIRED Built-Up');

//Istogramma SWIRED Index Margherita di Savoia

var chartSWIREDBuiltUp = ui.Chart.image.histogram ({image:SWIREDBuiltUp,region:Confini,scale:10,maxPixels:30402668});
print(chartSWIREDBuiltUp,'Istogramma SWIRED Built-Up Margherita di Savoia Marzo 2019');

Map.addLayer(SWIREDBuiltUp.clip(Confini),{},'SWIRED Built-Up Margherita di Savoia Marzo 2019');

// Soglia per distinguere BuiltUp dall'ImmagineMediaNoSalineNoWater

var threshold_swiredbuiltup = 0.23;

print('Threshold Separazione Manuale Built-Up  su SWIRED',threshold_swiredbuiltup );

// Maschera BuiltUp

var BuiltUpMask = SWIREDBuiltUp.lte(threshold_swiredbuiltup);

Map.addLayer(BuiltUpMask.selfMask().clip(Confini), {palette: ['#8b2e2e']}, 'Separazione Aree edificate');

//Creazione ImmagineMediaNoSalineNoWaterNoBuiltUp (Mascherare anche builtup dall'immagine)

var withoutbuiltup = function(ImmagineMediaNoSalineNoWater) {
  return ImmagineMediaNoSalineNoWater.updateMask(BuiltUpMask.not());
};

var ImmagineMediaNoSalineNoWaterNoBuiltup = withoutbuiltup(ImmagineMediaNoSalineNoWater).clip(Confini);
Map.addLayer(ImmagineMediaNoSalineNoWaterNoBuiltup, {}, 'Immagine No Water No Saline No Built-Up');

//Su ImmagineMediaNoSalineNoWaterNoBuiltUp vado ad applicare indici per estrarre la vegetazione tramite GOSAVI

//ESTRAZIONE VEGETAZIONE (GOSAVI)

//GOSAVI

var NIR = ImmagineMediaNoSalineNoWaterNoBuiltup.select("B8");
var G = ImmagineMediaNoSalineNoWaterNoBuiltup.select("B3");
var alpha = 0.16;
var GOSAVI = ImmagineMediaNoSalineNoWaterNoBuiltup.expression(('(NIR-G)/(NIR+G+alpha)'),
{'NIR':NIR,
'G': G,
'alpha':alpha
});

//Export GOSAVIMANUALE1

var gosavimanuale1 = GOSAVI.select(['B8']);
Export.image.toDrive({
  image: gosavimanuale1.clip(Confini),
  folder: "OTSUManualeMarzo2019",
  description: ' GosaviManuale1MargheritadiSavoiaMarzo2019',
  scale:10,
  region: Confini
  
});
// Minimo e massimo valore GOSAVI

var minmax = GOSAVI.reduceRegion({
  geometry:Confini,
  reducer: ee.Reducer.minMax(),
  scale:10,
  bestEffort:true
});

print(minmax,'MINIMI E MASSIMI VALORI GOSAVI');

//Istogramma GOSAVI Margherita di Savoia

var chartGOSAVI = ui.Chart.image.histogram ({image:GOSAVI,region:Confini,scale:10,maxPixels:30402668});
print(chartGOSAVI,'Istogramma GOSAVI Margherita di Savoia Marzo 2019');

Map.addLayer(GOSAVI.clip(Confini),{},'GOSAVI Margherita di Savoia Marzo 2019');

// Soglia per distinguere Vegetazione dall'ImmagineMediaNoSalineNoWaterNoBuiltUp

var threshold_gosavi = 0.45;

print('Threshold Separazione Manuale Vegetazione  su GOSAVI',threshold_gosavi );

// Maschera Vegetazione

var VegetationMask = GOSAVI.gte(threshold_gosavi);

Map.addLayer(VegetationMask.selfMask().clip(Confini), {palette: ['#4caf50']}, 'Separazione Vegetazione');

//Vado a mascherare anche la vegetazione ed otterrò l'immagine con i soli pixel relativi albare soil (pixel rimanenti del GOSAVI)

//Creazione ImmagineMediaNoSalineNoWaterNoBuiltUpNoVegetation (Mascherare anche vegetazione dall'immagine)

var withoutvegetation = function(ImmagineMediaNoSalineNoWaterNoBuiltup) {
  return ImmagineMediaNoSalineNoWaterNoBuiltup.updateMask(VegetationMask.not());
};

var ImmagineMediaNoSalineNoWaterNoBuiltupNoVegetation = withoutvegetation(ImmagineMediaNoSalineNoWaterNoBuiltup).clip(Confini);
Map.addLayer(ImmagineMediaNoSalineNoWaterNoBuiltupNoVegetation, {}, 'Immagine No Water No Saline No Built-Up No Vegetation');

// Maschera Bare Soil

var BareSoilMask = GOSAVI.lt(threshold_gosavi); ;

Map.addLayer(BareSoilMask.selfMask().clip(Confini), {palette: ['#d2b48c']}, 'Separazione Suolo nudo');

//Vado ad unire le varie maschere (Saline+Water+BuiltUp+Vegetation+BareSoil al fine di generare il layer di classificazione MANUAL THRESHOLDING sul quale effettuare la verifica dell'accuratezza

var classificazionemanuale = ee.Image(0).where(salineMasked,1).where(WaterMasked,2).clip(Confini).where(BuiltUpMask,3).where(VegetationMask,4).where(BareSoilMask,5);

Map.addLayer(classificazionemanuale, {min: 0, max: 5, palette: ['black', '#e6a0c4', '#1f4e79','#8b2e2e','#4caf50','#d2b48c']}, 'Mappa LULC Manual Thresholding Margherita di Savoia Marzo 2019');

//Export Mappa LULC Manual Thresholding

var MappaLULCManualThresholding = classificazionemanuale.select(['constant']);

Export.image.toDrive({
  image: MappaLULCManualThresholding.clip(Confini),
  folder: "MappaLULCManualThresholdingMarzo2019",
  description: ' MappaLULCManualThresholdingMargheritadiSavoiaMarzo2019',
  scale:10,
  region: Confini
  
});

//VERIFICA DELL'ACCURATEZZA CLASSIFICAZIONE MANUAL THRESHOLDING

//Generazione punti casuali su classificazione MANUAL THRESHOLDING

var numPointsPerClass = 125;
function samplePoints(classValue, numPoints, seedValue) {
  return classificazionemanuale.updateMask(classificazionemanuale.eq(classValue)).stratifiedSample({
    numPoints: numPointsPerClass,
    classBand: 'constant', //è la banda della classificazione, contenente i valori 1, 2, 3, 4 ,5 delle rispettive classi: saline, water, built-up, vegetation, bare soil
    region: Confini,
    scale: 10,
    classValues: [classValue],
    classPoints: [numPointsPerClass],
    seed: 1,
    geometries: true
  });
}

// Campionamento punti casuali su classificazione MANUAL THRESHOLDING

var pointsSaline = samplePoints(1);
var pointsWater = samplePoints(2);
var pointsBuiltUp = samplePoints(3);
var pointsVegetation = samplePoints(4);
var pointsBareSoil = samplePoints(5);

// Unione dei punti casuali ed esportazione in formato GEOJSON

var randomPoints = pointsSaline.merge(pointsWater).merge(pointsBuiltUp).merge(pointsVegetation).merge(pointsBareSoil);

Map.addLayer(randomPoints, {color: 'red'}, 'Punti Casuali MANUAL TRHESHOLDING');

print('Numero di punti casuali "Saline":', pointsSaline.size());
print('Numero di punti casuali "Water":', pointsWater.size());
print('Numero di punti casuali "Built-Up:', pointsBuiltUp.size());
print('Numero di punti casuali "Vegetation:', pointsVegetation.size());
print('Numero di punti casuali "Bare Soil:', pointsBareSoil.size());
print('Numero di punti casuali totale:', randomPoints.size());

Export.table.toDrive({
  collection: randomPoints,
  folder: "ManualThresholdingMarzo2019",
  description: 'PuntiRandomiciManualThresholdingMarzo2019',
  fileFormat: 'GeoJSON'
});

// Import punti casuali corretti in QGIS (fotointerpretazione) 

var punticorretti = PuntiValidazioneManualThresholdingMarzo2019
Map.addLayer(punticorretti, {color: 'yellow'}, 'Punti Validazione Manual Thresholding');

//Verifica accuratezza CLASSIFICAZIONE MANUAL THRESHOLDING

var campionamentopunticorretti = classificazionemanuale.sampleRegions({
  collection: punticorretti,
  properties: ['correzione'], //Nome campo punti corretti in QGIS (modificato da constant a correzione - passaggio fondamentale. Sistema di riferimento non alterato.)
  scale: 10,
  geometries: true
});

var confusionMatrix = campionamentopunticorretti.errorMatrix('correzione', 'constant');

print('Matrice di confusione - CLASSIFICAZIONE MANUAL THRESHOLDING:', confusionMatrix);

var overallAccuracy = confusionMatrix.accuracy();
print('Overall Accuracy - CLASSIFICAZIONE MANUAL THRESHOLDING:', overallAccuracy);

var userAccuracy = confusionMatrix.consumersAccuracy();
var producerAccuracy = confusionMatrix.producersAccuracy();
print('User Accuracy - CLASSIFICAZIONE MANUAL THRESHOLDING:', userAccuracy);
print('Producer Accuracy - CLASSIFICAZIONE MANUAL THRESHOLDING:', producerAccuracy);

print('Kappa statistic - CLASSIFICAZIONE MANUAL THRESHOLDING:', confusionMatrix.kappa());
