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

//Export SWIREDOTSU1

var swiredotsu1 = SWIRED.select(['B11']);

Export.image.toDrive({
  image: swiredotsu1.clip(Confini),
  folder: "OTSUManualeMarzo2019",
  description: ' SwiredOTSU1MargheritadiSavoiaMarzo2019',
  scale:10,
  region: Confini
  
});

// Istogramma SWIR

var histogramSalineWater = SWIRED.select('B11').reduceRegion({
  reducer: ee.Reducer.histogram()
      .combine('mean', null, true)
      .combine('variance', null, true), 
  geometry: Confini, 
  scale: 10,
  bestEffort: true
});
print(histogramSalineWater, 'Media e Varianza Istogramma SWIRED');


// Return the DN that maximizes interclass variance.

var otsu = function(histogramSalineWater) {
  var counts = ee.Array(ee.Dictionary(histogramSalineWater).get('histogram'));
  var means = ee.Array(ee.Dictionary(histogramSalineWater).get('bucketMeans'));
  var size = means.length().get([0]);
  var total = counts.reduce(ee.Reducer.sum(), [0]).get([0]);
  var sum = means.multiply(counts).reduce(ee.Reducer.sum(), [0]).get([0]);
  var mean = sum.divide(total);
  
  var indices = ee.List.sequence(1, size);
  
  // Compute between sum of squares, where each mean partitions the data.
  var bss = indices.map(function(i) {
    var aCounts = counts.slice(0, 0, i);
    var aCount = aCounts.reduce(ee.Reducer.sum(), [0]).get([0]);
    var aMeans = means.slice(0, 0, i);
    var aMean = aMeans.multiply(aCounts)
        .reduce(ee.Reducer.sum(), [0]).get([0])
        .divide(aCount);
    var bCount = total.subtract(aCount);
    var bMean = sum.subtract(aCount.multiply(aMean)).divide(bCount);
    return aCount.multiply(aMean.subtract(mean).pow(2)).add(
           bCount.multiply(bMean.subtract(mean).pow(2)));
  });
  
  print(ui.Chart.array.values(ee.Array(bss), 0, means));
  
  // Return the mean value corresponding to the maximum BSS.
  return means.sort(bss).get([-1]);
};

var ThresholdSalineWater = otsu(histogramSalineWater.get('B11_histogram'));

print('Threshold Separazione Mare/Saline (METODO DI OTSU) su SWIRED', ThresholdSalineWater);

var OTSUMaskSalineWater = SWIRED.select('B11').lte(ThresholdSalineWater);

Map.addLayer(OTSUMaskSalineWater.mask(OTSUMaskSalineWater).clip(Confini), {palette: 'blue'}, 'Separazione Superfici acquatiche/Saline (METODO DI OTSU) su SWIRED');

//Seleziono i pixel Saline/Superfici acquatiche sui quali calcolare SEA Index

var watersaline = function (ImmagineMedia){
  return ImmagineMedia.updateMask(OTSUMaskSalineWater);
};

var ImmagineMediaWaterSaline = watersaline(ImmagineMedia).clip(Confini);
Map.addLayer(ImmagineMediaWaterSaline, {}, 'Immagine Water/Saline');

//METODO DI OTSU SEPARAZIONE SALINE (SU SEA Index)

var RED = ImmagineMediaWaterSaline.select("B4");
var RE1 = ImmagineMediaWaterSaline.select("B5");
var GREEN = ImmagineMediaWaterSaline.select("B3");


var SEAIndex = ImmagineMediaWaterSaline.expression(('(RED+RE1)/(GREEN)'),
{'RE1':RE1,
'RED':RED,
'GREEN':GREEN
});

Map.addLayer(SEAIndex.clip(Confini), {}, 'SEA Index Margherita di Savoia Marzo 2019');

//Export SEAIndexOTSU1

var seaindexotsu1 = SEAIndex.select(['B4']);

Export.image.toDrive({
  image: seaindexotsu1.clip(Confini),
  folder: "OTSUManualeMarzo2019",
  description: ' SEAIndexOTSU1MargheritadiSavoiaMarzo2019',
  scale:10,
  region: Confini
  
});


// Istogramma SEA Index

var histogramSaline = SEAIndex.select('B4').reduceRegion({
  reducer: ee.Reducer.histogram()
      .combine('mean', null, true)
      .combine('variance', null, true), 
  geometry: Confini, 
  scale: 10,
  bestEffort: true
});
print(histogramSaline, 'Media e Varianza Istogramma SEA Index');


// Return the DN that maximizes interclass variance in B5 (in the region).

var otsu = function(histogramSaline) {
  var counts = ee.Array(ee.Dictionary(histogramSaline).get('histogram'));
  var means = ee.Array(ee.Dictionary(histogramSaline).get('bucketMeans'));
  var size = means.length().get([0]);
  var total = counts.reduce(ee.Reducer.sum(), [0]).get([0]);
  var sum = means.multiply(counts).reduce(ee.Reducer.sum(), [0]).get([0]);
  var mean = sum.divide(total);
  
  var indices = ee.List.sequence(1, size);
  
  // Compute between sum of squares, where each mean partitions the data.
  var bss = indices.map(function(i) {
    var aCounts = counts.slice(0, 0, i);
    var aCount = aCounts.reduce(ee.Reducer.sum(), [0]).get([0]);
    var aMeans = means.slice(0, 0, i);
    var aMean = aMeans.multiply(aCounts)
        .reduce(ee.Reducer.sum(), [0]).get([0])
        .divide(aCount);
    var bCount = total.subtract(aCount);
    var bMean = sum.subtract(aCount.multiply(aMean)).divide(bCount);
    return aCount.multiply(aMean.subtract(mean).pow(2)).add(
           bCount.multiply(bMean.subtract(mean).pow(2)));
  });
  
  print(ui.Chart.array.values(ee.Array(bss), 0, means));

  // Return the mean value corresponding to the maximum BSS.
  return means.sort(bss).get([-1]);
};

var ThresholdSaline = otsu(histogramSaline.get('B4_histogram'));

print('Threshold Separazione Saline (METODO DI OTSU) su SEA Index', ThresholdSaline);

var OTSUMaskSaline = SEAIndex.select('B4').gte(ThresholdSaline);

var OTSUMaskSaline = OTSUMaskSalineWater.updateMask(OTSUMaskSaline);
Map.addLayer(OTSUMaskSaline.selfMask().clip(Confini), {palette: ['#e6a0c4']}, 'Separazione Saline (METODO DI OTSU) su SEA Index');

//Map.addLayer(OTSUMaskSaline.mask(OTSUMaskSaline).clip(Confini), {palette: 'pink'}, 'Separazione Saline (METODO DI OTSU) su SEA Index');

var OTSUMaskWater = SEAIndex.select('B4').lt(ThresholdSaline);
var OTSUMaskWater = OTSUMaskWater.updateMask(OTSUMaskWater);
Map.addLayer(OTSUMaskWater.selfMask().clip(Confini), {palette: ['#1f4e79']}, 'Separazione Superfici acquatiche (METODO DI OTSU) su SEA Index');

var nowaternosaline = function (ImmagineMedia){
  return ImmagineMedia.updateMask(OTSUMaskSalineWater.not());
};

var ImmagineMediaNoSalineNoWaterOtsu = nowaternosaline(ImmagineMedia).clip(Confini);
Map.addLayer(ImmagineMediaNoSalineNoWaterOtsu, {}, 'Immagine No Saline/No Water');

//Su ImmagineMediaNoSalineNoWaterOtsu vado ad applicare indici per estrarre prima di tutto il built-up tramite SWIRED

//ESTRAZIONE BUILT-UP (SWIRED) OTSU

//SWIRED OTSU

var RED = ImmagineMediaNoSalineNoWaterOtsu.select("B4");
var SWIR1 = ImmagineMediaNoSalineNoWaterOtsu.select("B11");
var SWIREDBuiltUpOtsu = ImmagineMediaNoSalineNoWaterOtsu.expression(('(SWIR1-RED)/(SWIR1+RED)'),
{'SWIR1':SWIR1,
'RED': RED
});

//Export SWIREDOTSU2

var swiredotsu2 = SWIREDBuiltUpOtsu.select(['B11']);
Export.image.toDrive({
  image: swiredotsu2.clip(Confini),
  folder: "OTSUManualeMarzo2019",
  description: ' SwiredOTSU2MargheritadiSavoiaMarzo2019',
  scale:10,
  region: Confini
  
});

// Istogramma SWIRED Built-Up OTSU

var histogramSWIREDBuiltUpOtsu = SWIREDBuiltUpOtsu.select('B11').reduceRegion({
  reducer: ee.Reducer.histogram()
      .combine('mean', null, true)
      .combine('variance', null, true), 
  geometry: Confini, 
  scale: 10,
  bestEffort: true
});
print(histogramSWIREDBuiltUpOtsu, 'Media e Varianza Istogramma SWIRED Built-Up OTSU');

// Return the DN that maximizes interclass variance.

var otsu = function(histogramSWIREDBuiltUpOtsu) {
  var counts = ee.Array(ee.Dictionary(histogramSWIREDBuiltUpOtsu).get('histogram'));
  var means = ee.Array(ee.Dictionary(histogramSWIREDBuiltUpOtsu).get('bucketMeans'));
  var size = means.length().get([0]);
  var total = counts.reduce(ee.Reducer.sum(), [0]).get([0]);
  var sum = means.multiply(counts).reduce(ee.Reducer.sum(), [0]).get([0]);
  var mean = sum.divide(total);
  
  var indices = ee.List.sequence(1, size);
  
  // Compute between sum of squares, where each mean partitions the data.
  var bss = indices.map(function(i) {
    var aCounts = counts.slice(0, 0, i);
    var aCount = aCounts.reduce(ee.Reducer.sum(), [0]).get([0]);
    var aMeans = means.slice(0, 0, i);
    var aMean = aMeans.multiply(aCounts)
        .reduce(ee.Reducer.sum(), [0]).get([0])
        .divide(aCount);
    var bCount = total.subtract(aCount);
    var bMean = sum.subtract(aCount.multiply(aMean)).divide(bCount);
    return aCount.multiply(aMean.subtract(mean).pow(2)).add(
           bCount.multiply(bMean.subtract(mean).pow(2)));
  });
  
  print(ui.Chart.array.values(ee.Array(bss), 0, means));
  
  // Return the mean value corresponding to the maximum BSS.
  return means.sort(bss).get([-1]);
};

var ThresholdBuiltUpOtsu = otsu(histogramSWIREDBuiltUpOtsu.get('B11_histogram'));

print('Threshold Separazione Built-Up (METODO DI OTSU) su SWIRED', ThresholdBuiltUpOtsu);

var OTSUMaskBuiltUp = SWIREDBuiltUpOtsu.select('B11').lte(ThresholdBuiltUpOtsu);

Map.addLayer(OTSUMaskBuiltUp.mask(OTSUMaskBuiltUp).clip(Confini), {palette: '#8b2e2e'}, 'Separazione Aree edificate (METODO DI OTSU) su SWIRED');

//Creazione ImmagineMediaNoSalineNoWaterNoBuiltUp (Mascherare anche builtup dall'immagine)

var withoutbuiltupOtsu = function(ImmagineMediaNoSalineNoWaterOtsu) {
  return ImmagineMediaNoSalineNoWaterOtsu.updateMask(OTSUMaskBuiltUp.not());
};

var ImmagineMediaNoSalineNoWaterNoBuiltupOtsu = withoutbuiltupOtsu(ImmagineMediaNoSalineNoWaterOtsu).clip(Confini);
Map.addLayer(ImmagineMediaNoSalineNoWaterNoBuiltupOtsu, {}, 'Immagine No Water No Saline No Built-Up Otsu');

//Su ImmagineMediaNoSalineNoWaterNoBuiltUpOtsu vado ad applicare indici per estrarre la vegetazione tramite GOSAVI

//ESTRAZIONE VEGETAZIONE (GOSAVI) OTSU

//GOSAVI OTSU

var NIR = ImmagineMediaNoSalineNoWaterNoBuiltupOtsu.select("B8");
var G = ImmagineMediaNoSalineNoWaterNoBuiltupOtsu.select("B3");
var alpha = 0.16;
var GOSAVIOtsu = ImmagineMediaNoSalineNoWaterNoBuiltupOtsu.expression(('(NIR-G)/(NIR+G+alpha)'),
{'NIR':NIR,
'G': G,
'alpha':alpha
});

//Export GOSAVIOTSU1

var gosaviotsu1 = GOSAVIOtsu.select(['B8']);

Export.image.toDrive({
  image: gosaviotsu1.clip(Confini),
  folder: "OTSUManualeMarzo2019",
  description: ' GosaviOTSU1MargheritadiSavoiaMarzo2019',
  scale:10,
  region: Confini
  
});
// Istogramma GOSAVI OTSU

var histogramGOSAVIOtsu = GOSAVIOtsu.select('B8').reduceRegion({
  reducer: ee.Reducer.histogram()
      .combine('mean', null, true)
      .combine('variance', null, true), 
  geometry: Confini, 
  scale: 10,
  bestEffort: true
});
print(histogramGOSAVIOtsu, 'Media e Varianza Istogramma GOSAVI OTSU');

// Return the DN that maximizes interclass variance.

var otsu = function(histogramGOSAVIOtsu) {
  var counts = ee.Array(ee.Dictionary(histogramGOSAVIOtsu).get('histogram'));
  var means = ee.Array(ee.Dictionary(histogramGOSAVIOtsu).get('bucketMeans'));
  var size = means.length().get([0]);
  var total = counts.reduce(ee.Reducer.sum(), [0]).get([0]);
  var sum = means.multiply(counts).reduce(ee.Reducer.sum(), [0]).get([0]);
  var mean = sum.divide(total);
  
  var indices = ee.List.sequence(1, size);
  
  // Compute between sum of squares, where each mean partitions the data.
  var bss = indices.map(function(i) {
    var aCounts = counts.slice(0, 0, i);
    var aCount = aCounts.reduce(ee.Reducer.sum(), [0]).get([0]);
    var aMeans = means.slice(0, 0, i);
    var aMean = aMeans.multiply(aCounts)
        .reduce(ee.Reducer.sum(), [0]).get([0])
        .divide(aCount);
    var bCount = total.subtract(aCount);
    var bMean = sum.subtract(aCount.multiply(aMean)).divide(bCount);
    return aCount.multiply(aMean.subtract(mean).pow(2)).add(
           bCount.multiply(bMean.subtract(mean).pow(2)));
  });
  
  print(ui.Chart.array.values(ee.Array(bss), 0, means));
  
  // Return the mean value corresponding to the maximum BSS.
  return means.sort(bss).get([-1]);
};

var ThresholdGOSAVIOtsu = otsu(histogramGOSAVIOtsu.get('B8_histogram'));

print('Threshold Separazione Vegetazione (METODO DI OTSU) su GOSAVI', ThresholdGOSAVIOtsu);

var OTSUMaskVegetation = GOSAVIOtsu.select('B8').gte(ThresholdGOSAVIOtsu);

Map.addLayer(OTSUMaskVegetation.mask(OTSUMaskVegetation).clip(Confini), {palette: '#4caf50'}, 'Separazione Vegetazione (METODO DI OTSU) su GOSAVI');

//Vado a mascherare anche la vegetazione ed otterrò l'immagine con i soli pixel relativi al bare soil (pixel rimanenti del GOSAVI)

//Creazione ImmagineMediaNoSalineNoWaterNoBuiltUpNoVegetation (Mascherare anche vegetazione dall'immagine)

var withoutvegetationOtsu = function(ImmagineMediaNoSalineNoWaterNoBuiltupOtsu) {
  return ImmagineMediaNoSalineNoWaterNoBuiltupOtsu.updateMask(OTSUMaskVegetation.not());
};

var ImmagineMediaNoSalineNoWaterNoBuiltupNoVegetationOtsu = withoutvegetationOtsu(ImmagineMediaNoSalineNoWaterNoBuiltupOtsu).clip(Confini);
Map.addLayer(ImmagineMediaNoSalineNoWaterNoBuiltupNoVegetationOtsu, {}, 'Immagine No Water No Saline No Built-Up No Vegetation Otsu');

// Maschera Bare Soil

var OTSUMaskBareSoil = GOSAVIOtsu.lt(ThresholdGOSAVIOtsu); ;

Map.addLayer(OTSUMaskBareSoil.selfMask().clip(Confini), {palette: ['#d2b48c']}, 'Separazione Suolo nudo');

//MAPPA CLASSIFICAZIONE OTSU THRESHOLDING

//Utilizzerò classe 0 (Background) - classe 1 (Saline) - classe 2 (Water) - classe 3 (built up areas) - classe 4 (vegetation) - classe 5 (bare soil areas)
var classificazioneOTSU = ee.Image(0).where(OTSUMaskSaline,1).where(OTSUMaskWater,2).where(OTSUMaskBuiltUp,3).where(OTSUMaskVegetation,4).where(OTSUMaskBareSoil,5).clip(Confini);
Map.addLayer(classificazioneOTSU, {min: 0, max: 5, palette: ['black', '#e6a0c4', '#1f4e79','#8b2e2e','#4caf50','#d2b48c']}, 'Mappa LULC OTSU Thresholding Margherita di Savoia Marzo 2019');

//Export Mappa LULC OTSU Thresholding

var MappaLULCOTSUThresholding = classificazioneOTSU.select(['constant']);

Export.image.toDrive({
  image: MappaLULCOTSUThresholding.clip(Confini),
  folder: "MappaLULCOTSUThresholdingMarzo2019",
  description: ' MappaLULCOTSUThresholdingMargheritadiSavoiaMarzo2019',
  scale:10,
  region: Confini
  
});

//VERIFICA DELL'ACCURATEZZA CLASSIFICAZIONE OTSU

//Generazione punti cssuali su classificazione OTSU

var numPointsPerClass = 125;


function samplePoints(classValue, numPoints, seedValue) {
  return classificazioneOTSU.updateMask(classificazioneOTSU.eq(classValue)).stratifiedSample({
    numPoints: numPointsPerClass,
    classBand: 'constant', //è la banda della classificazione OTSU THRESHOLDING, contenente i valori 1, 2, 3, 4 ,5 delle rispettive classi: saline, water, built-up, vegetation, bare soil
    region: Confini,
    scale: 10,
    classValues: [classValue],
    classPoints: [numPointsPerClass],
    seed: 2,
    geometries: true
  });
}

// Campionamento punti casuali su classificazione OTSU

var pointsSaline = samplePoints(1);
var pointsWater = samplePoints(2);
var pointsBuiltUp = samplePoints(3);
var pointsVegetation = samplePoints(4);
var pointsBareSoil = samplePoints(5);

// Unione dei punti casuali ed esportazione in formato GEOJSON

var randomPoints = pointsSaline.merge(pointsWater).merge(pointsBuiltUp).merge(pointsVegetation).merge(pointsBareSoil);

Map.addLayer(randomPoints, {color: 'red'}, 'Punti Casuali OTSU THRESHOLDING');

print('Numero di punti casuali "Saline":', pointsSaline.size());
print('Numero di punti casuali "Water":', pointsWater.size());
print('Numero di punti casuali "Built-Up:', pointsBuiltUp.size());
print('Numero di punti casuali "Vegetation:', pointsVegetation.size());
print('Numero di punti casuali "Bare Soil:', pointsBareSoil.size());
print('Numero di punti casuali totale:', randomPoints.size());

Export.table.toDrive({
  collection: randomPoints,
  folder: "OTSUThresholdingMarzo2019",
  description: 'PuntiRandomiciOTSUThresholdingMarzo2019',
  fileFormat: 'GeoJSON'
});

// Importazione punti casuali corretti in QGIS (fotointerpretazione) 

var punticorretti = PuntiValidazioneOTSUThresholdingMarzo2019;
Map.addLayer(punticorretti, {color: 'yellow'}, 'Punti Validazione OTSU Thresholding');

//Verifica accuratezza CLASSIFICAZIONE OTSU THRESHOLDING

var campionamentopunticorretti = classificazioneOTSU.sampleRegions({
  collection: punticorretti,
  properties: ['correzione'], //Nome campo punti corretti in QGIS (modificato da constant a correzione - passaggio fondamentale. Sistema di riferimento non alterato.)
  scale: 10,
  geometries: true
});

var confusionMatrix = campionamentopunticorretti.errorMatrix('correzione', 'constant');

print('Matrice di confusione - CLASSIFICAZIONE OTSU THRESHOLDING:', confusionMatrix);

var overallAccuracy = confusionMatrix.accuracy();
print('Overall Accuracy - CLASSIFICAZIONE OTSU THRESHOLDING:', overallAccuracy);

var userAccuracy = confusionMatrix.consumersAccuracy();
var producerAccuracy = confusionMatrix.producersAccuracy();
print('User Accuracy - CLASSIFICAZIONE OTSU THRESHOLDING:', userAccuracy);
print('Producer Accuracy - CLASSIFICAZIONE OTSU THRESHOLDING:', producerAccuracy);

print('Kappa statistic - CLASSIFICAZIONE OTSU THRESHOLDING:', confusionMatrix.kappa());

