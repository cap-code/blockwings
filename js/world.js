// world.js — planet Earth: continent data, rasterization, terrain sampling.
//
// The whole planet is mapped onto a block grid:
//   x (east-west)  : 0..WORLD_W, wraps around (lon -180..180)
//   z (north-south): 0..WORLD_H (lat 90..-90)
// 1 block ≈ 0.6 km. Heights are exaggerated for Minecraft-y drama.

export const WORLD_W = 65536;
export const WORLD_H = 32768;
export const SEA_Y = 0;          // water surface height (blocks)

const RW = 2880, RH = 1440;      // Earth raster: 0.125° per cell

// ---------------------------------------------------------------- geometry data
// Continent / island outlines as [lon, lat] loops (very rough — it's voxels!).
// Longitudes may exceed 180 to cross the antimeridian (Siberia → Alaska side).
const LAND = [
  // North America
  [[-168,66],[-165,60],[-158,58],[-152,59],[-146,60],[-136,57],[-130,54],[-125,49],
   [-124,43],[-122,37],[-117,33],[-110,24],[-106,20],[-97,16],[-92,15],[-85,12],
   [-80,9],[-78,7],[-82,9],[-83,15],[-89,16],[-87,21],[-91,21],[-91,18],[-96,19],
   [-97,26],[-94,29],[-89,30],[-84,30],[-81,25],[-80,27],[-81,31],[-76,35],[-74,40],
   [-70,42],[-66,45],[-60,46],[-56,50],[-58,55],[-61,58],[-64,60],[-70,63],[-78,62],
   [-82,66],[-90,69],[-105,69],[-115,69],[-128,70],[-141,70],[-156,71],[-162,67]],
  // Greenland
  [[-53,60],[-43,60],[-38,65],[-22,70],[-18,76],[-22,82],[-32,84],[-58,82],[-68,80],
   [-60,75],[-54,69]],
  // South America
  [[-78,7],[-77,4],[-80,1],[-81,-4],[-77,-12],[-72,-17],[-70,-23],[-71,-32],[-73,-40],
   [-74,-48],[-72,-54],[-68,-55],[-65,-47],[-65,-41],[-62,-39],[-57,-36],[-56,-34],
   [-52,-32],[-48,-26],[-44,-23],[-40,-22],[-37,-15],[-35,-9],[-35,-5],[-38,-4],
   [-44,-2],[-50,0],[-52,4],[-59,8],[-64,10],[-71,12],[-75,10]],
  // Africa
  [[-6,35],[-10,30],[-15,24],[-17,20],[-17,14],[-15,11],[-11,7],[-7,4],[-1,5],[4,6],
   [8,4],[9,2],[9,-2],[13,-6],[12,-12],[12,-18],[14,-23],[15,-28],[18,-34],[23,-34],
   [27,-33],[31,-29],[33,-26],[35,-24],[37,-18],[40,-15],[40,-10],[39,-7],[40,-3],
   [44,0],[49,7],[51,11],[48,11],[44,11],[42,13],[40,16],[38,19],[36,23],[34,28],
   [32,30],[27,31],[22,31],[18,30],[15,32],[10,33],[10,37],[5,37],[0,36]],
  // Arabia
  [[34,29],[35,25],[38,21],[41,16],[43,12],[45,12],[49,14],[53,17],[57,19],[59,22],
   [58,24],[55,25],[51,27],[48,29],[47,30],[44,31],[39,31]],
  // Eurasia
  [[-9,37],[-2,36],[3,40],[3,42],[5,43],[8,44],[13,45],[18,42],[20,40],[22,38],
   [24,38],[26,41],[29,41],[27,37],[30,36],[36,36],[35,33],[34,31],[32,31],[39,32],
   [45,31],[48,30],[52,27.5],[57,26],[61,25],[66,25],[68,23.5],[70,22.5],[72,21],
   [73,17],[74.5,13],[77,8],[78.2,8.8],[80,13],[81,16],[84,19],[87,21.5],[89,21.8],
   [91,22.3],[92,20.5],[94,16],[97,15],[98,11],[99,7],[103,1.4],[104,4],[102,7],
   [101,11],[100.8,13.2],[102,12.3],[104.8,8.6],[109,11.5],[109.5,13.5],[108,16],
   [106.7,18.7],[105.8,20],[106,20.8],[108,21.6],[110,21.5],[113,22],[117,23.5],
   [121,29],[121,32],[122,35],[122,38],[124,40],[125,39],[126,37],[126.5,34.8],
   [129,35.2],[129.7,37.5],[128.7,40],[131,42.5],[135,45],[138,46.5],[140,49],
   [141,53],[150,58],[156,51],[160,54],[163,58],[165,60],[170,62],[176,65],[185,64.5],
   [190,66],[187,68.5],[180,68.5],[170,69.5],[160,70.5],[150,71.5],[140,72.5],
   [130,73],[118,73.5],[113,73.7],[105,77.5],[97,76],[86,73.5],[80,72.5],[73,72],
   [72,68.5],[69,68.5],[66,69],[60,69.5],[54,68.5],[48,68],[44,67.5],[40,66],
   [37,66.5],[33,69],[28,71],[22,70.5],[15,68.5],[11,65],[5,62],[5,60],[7,58],
   [10,59],[11,57],[8,57],[8,55],[5,53.5],[3,51.5],[1,51],[-2,49.5],[-5,48.5],
   [-1,46.5],[-2,43.7],[-9,43.5]],
  // Italy + Sicily
  [[8,45],[12,44],[14,41],[17,40],[18,40],[16,38],[15,40],[12,41],[9,44]],
  [[12,37],[15,37],[15,38],[12,38]],
  // Britain, Ireland, Iceland
  [[-5,50],[1,51],[0,53],[-1,55],[-3,58],[-5,57],[-4,54],[-5,52]],
  [[-10,52],[-6,52],[-6,55],[-8,55],[-10,54]],
  [[-24,64],[-15,64],[-14,66],[-21,66]],
  // Japan
  [[129,31],[132,32],[131,34],[129,33]],
  [[131,34],[134,35],[137,35],[140,36],[141,41],[140,41],[137,37],[133,36],[131,35]],
  [[140,42],[143,42],[146,44],[142,45],[140,43]],
  // SE Asia islands
  [[95,5],[98,4],[103,-1],[106,-5],[104,-6],[100,-1],[96,3]],                  // Sumatra
  [[105,-6],[110,-7],[114,-8],[114,-9],[108,-8],[105,-7]],                     // Java
  [[109,0],[111,-3],[114,-4],[117,-3],[119,1],[117,4],[115,7],[112,5],[109,2]],// Borneo
  [[119,-3],[122,-5],[123,-3],[121,1],[119,0]],                                // Sulawesi
  [[131,-1],[136,-2],[141,-3],[146,-6],[150,-9],[148,-10],[143,-8],[138,-7],[134,-4],[131,-2]], // New Guinea
  [[120,14],[122,14],[122,18],[120,18]],                                       // Luzon
  [[122,6],[126,6],[126,9],[122,9]],                                           // Mindanao
  [[80,6],[82,7],[82,9],[80,9]],                                               // Sri Lanka
  [[120,22],[122,23],[121,25],[120,24]],                                       // Taiwan
  // Madagascar, Caribbean
  [[44,-25],[47,-25],[50,-17],[49,-12],[47,-15],[44,-22]],
  [[-85,22],[-79,21],[-74,20],[-75,21],[-80,23],[-84,23]],                     // Cuba
  [[-74,18],[-68,18],[-69,20],[-74,20]],                                       // Hispaniola
  // Australia, Tasmania, New Zealand
  [[113,-22],[115,-34],[124,-33],[129,-32],[132,-32],[138,-35],[141,-38],[147,-38],
   [150,-37],[153,-28],[149,-21],[143,-11],[141,-13],[138,-17],[136,-12],[130,-12],
   [126,-14],[122,-18],[114,-22]],
  [[145,-43],[148,-43],[148,-41],[145,-41]],
  [[166,-47],[171,-45],[174,-41],[172,-40],[168,-44],[166,-46]],
  [[172,-41],[176,-40],[178,-37],[176,-36],[173,-35],[174,-38]],
  // Antarctic peninsula (rest of Antarctica is added by latitude rule)
  [[-64,-63],[-58,-64],[-62,-69],[-68,-68]],
];

// Inland seas / big bays carved back out of the land mask.
const WATER = [
  [[-94,57],[-90,55],[-82,55],[-78,56],[-77,61],[-82,64],[-90,64],[-94,61]],   // Hudson Bay
  [[-88,46],[-83,42],[-79,43],[-77,44],[-82,46],[-86,48]],                     // Great Lakes
  [[10,54],[16,54],[21,55],[24,57],[28,59],[30,60],[26,60],[23,60],[22,63],
   [23,66],[20,66],[18,62],[18,59],[14,56],[10,55]],                           // Baltic
  [[28,43],[34,42],[40,41],[42,42],[40,44],[36,45],[33,46],[30,46]],           // Black Sea
  [[47,37],[54,37],[54,42],[52,45],[49,46],[47,44],[48,40]],                   // Caspian
  [[48,30],[51,29],[56,27],[57,25],[55,26],[51,27],[48,29]],                   // Persian Gulf
  [[33,28],[36,24],[40,18],[43,13],[41,14],[38,20],[34,26],[32,29]],           // Red Sea
  [[143,54],[150,57],[154,52],[148,53]],                                       // Sea of Okhotsk
  // great lakes of the world
  [[31.8,-2.8],[34.8,-2.8],[34.8,0.4],[31.8,0.4]],                             // Victoria
  [[103.5,51.4],[106,52],[109,54],[110,55.6],[108.5,55.6],[105,53],[103,52]],  // Baikal
  [[29.8,59.9],[33.5,59.9],[33.5,61.8],[29.8,61.8]],                           // Ladoga/Onega
  [[58,43.5],[61.5,43.5],[61.5,46.5],[58,46.5]],                               // Aral
  [[73.5,44.8],[79,45.6],[78.8,46.8],[73.3,45.8]],                             // Balkhash
  [[-70.4,-16.9],[-68.7,-16.9],[-68.7,-15.2],[-70.4,-15.2]],                   // Titicaca
  [[13,12.4],[15.6,12.4],[15.6,14.4],[13,14.4]],                               // Chad
  [[-117,60.8],[-112.8,60.8],[-112.8,62.6],[-117,62.6]],                       // Great Slave
  [[-125,64.7],[-118,64.7],[-118,67],[-125,67]],                               // Great Bear
  [[-99,50.2],[-96.4,50.2],[-96.4,53.8],[-99,53.8]],                           // Winnipeg
  [[136,-29.8],[138.2,-29.8],[138.2,-27.8],[136,-27.8]],                       // Eyre
];

// Major rivers: { p: polyline [lon,lat] source→mouth, w: half-width° }.
// Carved into the land mask as sea-level channels with lowland valleys.
const RIVERS = [
  { p: [[-73,-4.5],[-67,-3.5],[-60,-3],[-55,-2.5],[-52,-1.5],[-50,0]], w: 0.6 },            // Amazon
  { p: [[-62,8.5],[-66,7.5],[-68,6],[-67,3]], w: 0.35 },                                    // Orinoco
  { p: [[-58,-34],[-59,-31],[-58,-27],[-55,-24],[-52,-21]], w: 0.4 },                       // Paraná
  { p: [[-90,29.2],[-91,33],[-90,36],[-89,39],[-91,42],[-93,45],[-94,47]], w: 0.4 },        // Mississippi
  { p: [[-91,39],[-96,41],[-101,44],[-106,46],[-111,47]], w: 0.3 },                         // Missouri
  { p: [[-71,47.5],[-74,45],[-76,43.8]], w: 0.3 },                                          // St Lawrence
  { p: [[-135,69],[-130,66],[-124,63],[-117,61.5]], w: 0.35 },                              // Mackenzie
  { p: [[-164,62.8],[-158,62],[-150,64],[-145,64],[-140,63]], w: 0.35 },                    // Yukon
  { p: [[31,30.5],[31,27],[32.5,24],[33,20],[32,16],[33,12],[31,7],[32,2],[33,0]], w: 0.35 }, // Nile
  { p: [[12.2,-6],[16,-4],[20,-2],[23,0.5],[25,0],[24,-3],[27,-6]], w: 0.5 },               // Congo
  { p: [[-6,11],[-4,14],[0,16.8],[4,14],[6,10],[6.5,6]], w: 0.35 },                         // Niger
  { p: [[23,-15],[27,-17],[31,-16],[35,-17],[36.2,-18.5]], w: 0.32 },                       // Zambezi
  { p: [[48.5,46.5],[46,49],[44,52],[48,55],[48.5,58]], w: 0.4 },                           // Volga
  { p: [[9.5,48.3],[13,48.3],[17,47.8],[20,45],[25,44.2],[29,45.2]], w: 0.26 },             // Danube
  { p: [[7.8,47.3],[7.8,50],[6,51.8],[4.8,52]], w: 0.24 },                                  // Rhine
  { p: [[47.8,30.2],[44,33],[40,36],[38.5,38.2]], w: 0.26 },                                // Tigris–Euphrates
  { p: [[69,67],[72,64],[75,60],[82,55],[85,52.5]], w: 0.42 },                              // Ob
  { p: [[82.5,71],[86,67],[90,62],[92,57],[96,53.5]], w: 0.42 },                            // Yenisei
  { p: [[127,72],[125,68],[122,64],[125,60.5],[120,57.5]], w: 0.42 },                       // Lena
  { p: [[140.5,53],[137,50],[131,48],[127,49.5],[121,50.5]], w: 0.35 },                     // Amur
  { p: [[120.8,31.7],[117,30],[112,30],[107,29.5],[104,28.5],[100,27.5]], w: 0.42 },        // Yangtze
  { p: [[118.8,37.6],[114,35],[110,35.5],[107,37.5],[104,36],[101,35.5]], w: 0.32 },        // Yellow
  { p: [[106,10],[105,12.5],[105,15.5],[103,18],[101,20.5],[99,22.5]], w: 0.32 },           // Mekong
  { p: [[88.5,22.2],[86,25],[82,25.6],[78,27],[78.5,29.8]], w: 0.38 },                      // Ganges
  { p: [[67.8,24.2],[68,26],[71,29],[73,31],[74.8,33.8]], w: 0.32 },                        // Indus
  { p: [[89.5,25],[92,26],[95,27.8]], w: 0.3 },                                             // Brahmaputra
  { p: [[139.3,-35.3],[142,-34.3],[146,-35],[148.8,-36.2]], w: 0.26 },                      // Murray
];

// Mountain ranges: { p: polyline [lon,lat], w: width°, h: peak 0..1 }
const MOUNTAINS = [
  { p: [[-70,-50],[-70,-35],[-68,-25],[-72,-15],[-77,-8],[-78,-2],[-76,3]], w: 2.5, h: 0.9 },  // Andes
  { p: [[-106,33],[-107,38],[-111,43],[-114,48],[-118,54],[-124,60],[-135,62]], w: 3.5, h: 0.6 }, // Rockies
  { p: [[-119,36],[-121,40]], w: 1.5, h: 0.6 },                                // Sierra Nevada
  { p: [[-150,62],[-145,62]], w: 1.6, h: 0.7 },                                // Alaska Range
  { p: [[-85,34],[-80,38],[-75,42]], w: 2.5, h: 0.3 },                         // Appalachians
  { p: [[-105,24],[-100,19]], w: 2.5, h: 0.5 },                                // Sierra Madre
  { p: [[5,44],[8,46],[13,47],[15,47]], w: 2, h: 0.7 },                        // Alps
  { p: [[-1,43],[2,43]], w: 1.2, h: 0.5 },                                     // Pyrenees
  { p: [[19,49],[25,47],[25,45]], w: 1.5, h: 0.35 },                           // Carpathians
  { p: [[40,43],[47,42]], w: 1.5, h: 0.7 },                                    // Caucasus
  { p: [[32,39],[40,39]], w: 2, h: 0.35 },                                     // Anatolia
  { p: [[44,38],[48,34],[53,29],[57,27]], w: 2.5, h: 0.5 },                    // Zagros
  { p: [[54,32],[60,33]], w: 3, h: 0.35 },                                     // Iranian plateau
  { p: [[61,34],[68,35],[71,36]], w: 2, h: 0.75 },                             // Hindu Kush
  { p: [[73,35],[78,32],[83,29],[88,28],[94,28],[97,29]], w: 2.5, h: 1.0 },    // Himalaya
  { p: [[78,33],[85,33],[92,33],[98,32]], w: 4.5, h: 0.55 },                   // Tibetan plateau
  { p: [[68,42],[75,42],[82,43],[88,43]], w: 2, h: 0.65 },                     // Tien Shan
  { p: [[84,47],[92,50],[99,51]], w: 2, h: 0.5 },                              // Altai
  { p: [[100,52],[108,53]], w: 1.5, h: 0.35 },                                 // Sayan
  { p: [[128,62],[135,67]], w: 2, h: 0.35 },                                   // Verkhoyansk
  { p: [[158,52],[160,56]], w: 1.5, h: 0.5 },                                  // Kamchatka
  { p: [[57,51],[59,57],[61,63],[64,67]], w: 1.8, h: 0.3 },                    // Urals
  { p: [[6,59],[8,62],[13,65],[17,68]], w: 2, h: 0.4 },                        // Scandes
  { p: [[-8,31],[-2,33],[4,35],[9,36]], w: 1.8, h: 0.45 },                     // Atlas
  { p: [[36,7],[38,10],[39,13]], w: 2.5, h: 0.5 },                             // Ethiopian highlands
  { p: [[29,0],[30,-6]], w: 1.5, h: 0.35 },                                    // East African rift
  { p: [[35,-3],[37,-3]], w: 1.2, h: 0.55 },                                   // Kilimanjaro
  { p: [[27,-31],[30,-29]], w: 1.5, h: 0.45 },                                 // Drakensberg
  { p: [[-62,5],[-58,5]], w: 2, h: 0.3 },                                      // Guiana highlands
  { p: [[-46,-23],[-41,-20]], w: 2.5, h: 0.3 },                                // Brazilian highlands
  { p: [[74,11],[75,16],[73,20]], w: 1, h: 0.35 },                             // Western Ghats
  { p: [[147,-37],[150,-32],[152,-27],[148,-21]], w: 1.5, h: 0.3 },            // Great Dividing
  { p: [[137,35],[139,37]], w: 1, h: 0.5 },                                    // Japanese Alps
  { p: [[-45,65],[-40,72],[-35,77]], w: 4, h: 0.5 },                           // Greenland ice dome
  { p: [[170,-44],[168,-45]], w: 1, h: 0.6 },                                  // Southern Alps NZ
];

// Climate override zones: 1 desert, 2 rainforest, 3 ice sheet
const CLIMATE = [
  { v: 1, p: [[-13,18],[35,18],[35,30],[-10,30]] },        // Sahara
  { v: 1, p: [[39,18],[55,20],[52,30],[40,30]] },          // Arabian
  { v: 1, p: [[90,38],[110,38],[112,45],[92,46]] },        // Gobi
  { v: 1, p: [[118,-30],[140,-30],[138,-20],[120,-20]] },  // Outback
  { v: 1, p: [[15,-22],[24,-28],[24,-20],[17,-19]] },      // Kalahari/Namib
  { v: 1, p: [[-72,-18],[-68,-28],[-71,-28],[-72,-20]] },  // Atacama
  { v: 1, p: [[-117,32],[-105,32],[-105,38],[-117,38]] },  // US Southwest
  { v: 1, p: [[68,24],[74,24],[74,30],[68,30]] },          // Thar
  { v: 1, p: [[-72,-50],[-66,-50],[-66,-42],[-70,-42]] },  // Patagonia
  { v: 2, p: [[-75,-12],[-50,-12],[-48,3],[-72,6]] },      // Amazon
  { v: 2, p: [[12,-5],[28,-5],[28,4],[12,4]] },            // Congo
  { v: 2, p: [[95,-9],[150,-9],[150,8],[95,8]] },          // Maritime SE Asia
  { v: 3, p: [[-53,60],[-43,60],[-38,65],[-22,70],[-18,76],[-22,82],[-32,84],
              [-58,82],[-68,80],[-60,75],[-54,69]] },      // Greenland icecap
];

// City lights: [lon, lat, name] — blocky towers appear near these.
export const CITIES = [
  [76.28, 9.97, 'Kochi'], [72.8, 19.07, 'Mumbai'], [77.2, 28.6, 'Delhi'],
  [-74.0, 40.7, 'New York'], [-118.2, 34.05, 'Los Angeles'], [-122.4, 37.77, 'San Francisco'],
  [-87.6, 41.9, 'Chicago'], [-79.4, 43.7, 'Toronto'], [-99.1, 19.4, 'Mexico City'],
  [-43.2, -22.9, 'Rio de Janeiro'], [-46.6, -23.55, 'São Paulo'], [-58.4, -34.6, 'Buenos Aires'],
  [-0.1, 51.5, 'London'], [2.35, 48.85, 'Paris'], [37.6, 55.75, 'Moscow'], [29.0, 41.0, 'Istanbul'],
  [31.2, 30.0, 'Cairo'], [3.4, 6.45, 'Lagos'], [36.8, -1.3, 'Nairobi'], [18.4, -33.9, 'Cape Town'],
  [55.3, 25.2, 'Dubai'], [103.8, 1.35, 'Singapore'], [100.5, 13.75, 'Bangkok'],
  [106.8, -6.2, 'Jakarta'], [114.2, 22.3, 'Hong Kong'], [121.5, 31.2, 'Shanghai'],
  [116.4, 39.9, 'Beijing'], [127.0, 37.5, 'Seoul'], [139.7, 35.7, 'Tokyo'],
  [151.2, -33.87, 'Sydney'],
];

// Airports: dir 'EW' = runway runs east-west, 'NS' = north-south.
export const AIRPORTS = [
  { name: 'Kochi Intl', lon: 76.4, lat: 10.15, dir: 'EW' },
  { name: 'New York JFK', lon: -73.8, lat: 40.65, dir: 'EW' },
  { name: 'Los Angeles LAX', lon: -118.4, lat: 33.94, dir: 'EW' },
  { name: 'London Heathrow', lon: -0.45, lat: 51.47, dir: 'EW' },
  { name: 'Cairo Intl', lon: 31.4, lat: 30.12, dir: 'EW' },
  { name: 'Dubai Intl', lon: 55.36, lat: 25.25, dir: 'EW' },
  { name: 'Tokyo Haneda', lon: 139.78, lat: 35.55, dir: 'NS' },
  { name: 'Sydney Kingsford', lon: 151.18, lat: -33.95, dir: 'NS' },
  { name: 'Rio Galeão', lon: -43.25, lat: -22.8, dir: 'NS' },
];

export const SPAWNS = [
  { name: 'Kochi, India', lat: 9.97, lon: 76.28 },
  { name: 'Mount Everest', lat: 27.99, lon: 86.92 },
  { name: 'New York, USA', lat: 40.7, lon: -74.3 },
  { name: 'London, UK', lat: 51.5, lon: -0.1 },
  { name: 'Tokyo, Japan', lat: 35.7, lon: 139.7 },
  { name: 'Sydney, Australia', lat: -33.9, lon: 151.2 },
  { name: 'Rio de Janeiro', lat: -22.9, lon: -43.2 },
  { name: 'Cairo, Egypt', lat: 30.0, lon: 31.2 },
  { name: 'The Alps', lat: 45.9, lon: 7.9 },
  { name: 'Grand Canyon', lat: 36.1, lon: -112.1 },
  { name: 'Sahara Desert', lat: 23.0, lon: 10.0 },
  { name: 'Amazon Rainforest', lat: -3.5, lon: -62.0 },
  { name: '🛫 Kochi Intl — runway', apt: 0 },
  { name: '🛫 New York JFK — runway', apt: 1 },
  { name: '🛫 Los Angeles LAX — runway', apt: 2 },
  { name: '🛫 London Heathrow — runway', apt: 3 },
  { name: '🛫 Cairo Intl — runway', apt: 4 },
  { name: '🛫 Dubai Intl — runway', apt: 5 },
  { name: '🛫 Tokyo Haneda — runway', apt: 6 },
  { name: '🛫 Sydney Kingsford — runway', apt: 7 },
  { name: '🛫 Rio Galeão — runway', apt: 8 },
  { name: 'Random location', lat: null, lon: null },
];

// ---------------------------------------------------------------- helpers
export function hash2(x, z, seed = 0) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 144269504);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x, z, cell, seed) {
  const period = WORLD_W / cell;
  const xf = x / cell, zf = z / cell;
  let xi = Math.floor(xf), zi = Math.floor(zf);
  const tx = xf - xi, tz = zf - zi;
  const x0 = ((xi % period) + period) % period, x1 = (x0 + 1) % period;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const a = hash2(x0, zi, seed), b = hash2(x1, zi, seed);
  const c = hash2(x0, zi + 1, seed), d = hash2(x1, zi + 1, seed);
  const ab = a + (b - a) * sx, cd = c + (d - c) * sx;
  return ab + (cd - ab) * sz; // 0..1
}

function fbm(x, z, seed) {
  return vnoise(x, z, 256, seed) * 0.5 + vnoise(x, z, 64, seed + 7) * 0.28 +
         vnoise(x, z, 16, seed + 13) * 0.15 + vnoise(x, z, 4, seed + 29) * 0.07;
}

export function lonToX(lon) { return ((lon + 180) / 360) * WORLD_W; }
export function latToZ(lat) { return ((90 - lat) / 180) * WORLD_H; }
export function xToLon(x) { return ((((x % WORLD_W) + WORLD_W) % WORLD_W) / WORLD_W) * 360 - 180; }
export function zToLat(z) { return 90 - (z / WORLD_H) * 180; }

// ---------------------------------------------------------------- rasters
let maskR, elevR, climR;   // Uint8: land mask, elevation (128 = sea level), climate

function fillPoly(target, pts, value) {
  let lat0 = 90, lat1 = -90;
  for (const p of pts) { lat0 = Math.min(lat0, p[1]); lat1 = Math.max(lat1, p[1]); }
  const ry0 = Math.max(0, Math.floor((90 - lat1) / 180 * RH));
  const ry1 = Math.min(RH - 1, Math.ceil((90 - lat0) / 180 * RH));
  const xs = [];
  for (let ry = ry0; ry <= ry1; ry++) {
    const lat = 90 - ((ry + 0.5) / RH) * 180;
    xs.length = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] > lat) !== (b[1] > lat)) {
        xs.push(a[0] + ((lat - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const rx0 = Math.ceil((xs[k] + 180) / 360 * RW - 0.5);
      const rx1 = Math.floor((xs[k + 1] + 180) / 360 * RW - 0.5);
      for (let rx = rx0; rx <= rx1; rx++) {
        target[ry * RW + (((rx % RW) + RW) % RW)] = value;
      }
    }
  }
}

// box blur with a sliding window — O(1) per cell regardless of radius
function blur(src, radius, passes) {
  const tmp = new Float32Array(src.length);
  const w = radius * 2 + 1;
  for (let p = 0; p < passes; p++) {
    // horizontal (wraps around the planet)
    for (let y = 0; y < RH; y++) {
      const row = y * RW;
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += src[row + ((k % RW) + RW) % RW];
      for (let x = 0; x < RW; x++) {
        tmp[row + x] = s / w;
        s += src[row + (x + radius + 1) % RW] - src[row + (((x - radius) % RW) + RW) % RW];
      }
    }
    // vertical (clamped at the poles)
    for (let x = 0; x < RW; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += tmp[Math.min(RH - 1, Math.max(0, k)) * RW + x];
      for (let y = 0; y < RH; y++) {
        src[y * RW + x] = s / w;
        s += tmp[Math.min(RH - 1, y + radius + 1) * RW + x] - tmp[Math.max(0, y - radius) * RW + x];
      }
    }
  }
}

// stamp a smooth ridge of strength h (0..1) along a polyline into a field
function fillRidge(field, pts, w, h) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1];
    const lon0 = Math.min(ax, bx) - w, lon1 = Math.max(ax, bx) + w;
    const lat0 = Math.min(ay, by) - w, lat1 = Math.max(ay, by) + w;
    const ry0 = Math.max(0, Math.floor((90 - lat1) / 180 * RH));
    const ry1 = Math.min(RH - 1, Math.ceil((90 - lat0) / 180 * RH));
    const rx0 = Math.floor((lon0 + 180) / 360 * RW);
    const rx1 = Math.ceil((lon1 + 180) / 360 * RW);
    const abx = bx - ax, aby = by - ay;
    const ab2 = abx * abx + aby * aby || 1;
    for (let ry = ry0; ry <= ry1; ry++) {
      const lat = 90 - ((ry + 0.5) / RH) * 180;
      for (let rx = rx0; rx <= rx1; rx++) {
        const lon = ((rx + 0.5) / RW) * 360 - 180;
        let t = ((lon - ax) * abx + (lat - ay) * aby) / ab2;
        t = Math.max(0, Math.min(1, t));
        const dx = lon - (ax + abx * t), dy = lat - (ay + aby * t);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < w) {
          const f = 1 - d / w;
          const v = h * f * f * (3 - 2 * f);
          const idx = ry * RW + (((rx % RW) + RW) % RW);
          if (v > field[idx]) field[idx] = v;
        }
      }
    }
  }
}

export function buildEarth() {
  const mask = new Float32Array(RW * RH);
  climR = new Uint8Array(RW * RH);

  for (const poly of LAND) fillPoly(mask, poly, 1);
  for (const poly of WATER) fillPoly(mask, poly, 0);
  // Antarctica by latitude rule
  const antRow = Math.floor((90 + 67) / 180 * RH);
  for (let y = antRow; y < RH; y++) {
    for (let x = 0; x < RW; x++) { mask[y * RW + x] = 1; climR[y * RW + x] = 3; }
  }
  for (const c of CLIMATE) fillPoly(climR, c.p, c.v);

  // river field, carved out of the land mask so channels become water
  const riv = new Float32Array(RW * RH);
  for (const r of RIVERS) fillRidge(riv, r.p, r.w, 1);
  for (let i = 0; i < mask.length; i++) {
    if (riv[i] > 0.55 && mask[i] > 0.5) mask[i] = 0;
  }

  maskR = new Uint8Array(RW * RH);
  for (let i = 0; i < mask.length; i++) maskR[i] = mask[i] > 0.5 ? 1 : 0;

  // interior elevation: distance from coast via repeated blur of the mask
  // (rivers count as coast, so their banks become lowland valleys)
  const blurF = mask;            // reuse buffer
  blur(blurF, 10, 3);

  // mountain ridge field
  const mtn = new Float32Array(RW * RH);
  for (const m of MOUNTAINS) fillRidge(mtn, m.p, m.w, m.h);

  elevR = new Uint8Array(RW * RH);
  for (let i = 0; i < elevR.length; i++) {
    let e;
    if (maskR[i]) {
      e = 128 + Math.max(0, blurF[i] - 0.5) * 2 * 22 + mtn[i] * 115;
      e = Math.max(129, e - riv[i] * 46); // river valleys cut through the hills
    } else {
      e = 128 - Math.min(1, (0.5 - blurF[i]) * 2.2) * 90;
      if (riv[i] > 0.55) e = Math.max(e, 124); // rivers are shallow channels
    }
    elevR[i] = Math.max(0, Math.min(255, Math.round(e)));
  }
}

function bilinear(arr, rx, ry) {
  rx -= 0.5; ry -= 0.5;
  let x0 = Math.floor(rx), y0 = Math.floor(ry);
  const tx = rx - x0, ty = ry - y0;
  const y1 = Math.min(RH - 1, Math.max(0, y0 + 1));
  y0 = Math.min(RH - 1, Math.max(0, y0));
  const xa = ((x0 % RW) + RW) % RW, xb = (xa + 1) % RW;
  const a = arr[y0 * RW + xa], b = arr[y0 * RW + xb];
  const c = arr[y1 * RW + xa], d = arr[y1 * RW + xb];
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
}

// ---------------------------------------------------------------- sampling
const DEG_X = 360 / WORLD_W, DEG_Z = 180 / WORLD_H;

function rasterCoords(x, z) {
  const lon = (((x % WORLD_W) + WORLD_W) % WORLD_W) * DEG_X - 180;
  const lat = 90 - Math.min(WORLD_H, Math.max(0, z)) * DEG_Z;
  return [(lon + 180) / 360 * RW, (90 - lat) / 180 * RH, lat];
}

// ---------------------------------------------------------------- airports
// International layout (3× scale): 181×11 runway with piano-key thresholds,
// centerline, aiming-point bars, edge stripes and touchdown-zone markings;
// wide parallel taxiway with five connectors; a huge concrete apron with a
// pier terminal, jet bridges, control tower, triple hangars, a fuel farm and
// a helipad. Terrain flattens out over a 24-block blend.
export const RUN_HALF = 90;
const BLEND_R = 24;
const airportData = [];

function wrapDX(x, ax) {
  let dx = (((x - ax) % WORLD_W) + WORLD_W) % WORLD_W;
  if (dx > WORLD_W / 2) dx -= WORLD_W;
  return dx;
}

export function initAirports() {
  airportData.length = 0;
  for (const a of AIRPORTS) {
    const x = Math.round(lonToX(a.lon)), z = Math.round(latToZ(a.lat));
    const base = Math.max(2, rawHeightAt(x, z));
    airportData.push({ name: a.name, dir: a.dir, x, z, base });
  }
}

export function airportInfo(i) { return airportData[i]; }

export function nearestAirport(x, z, maxD) {
  for (const a of airportData) {
    const dx = wrapDX(x, a.x), dz = z - a.z;
    if (dx * dx + dz * dz <= maxD * maxD) return a;
  }
  return null;
}

// What does the airport (if any) say about this column?
// -> { kind: 'runway'|'taxiway'|'apron'|'blend', base, blend?, along?, cross? }
function airportAt(x, z) {
  let bestBlend = null;
  for (const a of airportData) {
    const dx = wrapDX(x, a.x), dz = z - a.z;
    if (dx > 130 || dx < -130 || dz > 130 || dz < -130) continue;
    const along = a.dir === 'EW' ? dx : dz;
    const cross = a.dir === 'EW' ? dz : dx;
    const aAbs = Math.abs(along);

    // main runway: 181 long, 11 wide
    if (aAbs <= RUN_HALF && Math.abs(cross) <= 5) {
      return { kind: 'runway', base: a.base, along, cross };
    }
    // parallel taxiway
    if (aAbs <= RUN_HALF - 4 && cross >= 9 && cross <= 12) {
      return { kind: 'taxiway', base: a.base, along, cross };
    }
    // runway <-> taxiway connectors (both ends, midfield, two rapid exits)
    if (cross >= 6 && cross <= 8) {
      for (const cAt of [-84, -42, 0, 42, 84]) {
        if (Math.abs(along - cAt) <= 2) return { kind: 'taxiway', base: a.base, along, cross };
      }
    }
    // apron with terminal / tower / hangars / helipad
    if (aAbs <= 64 && cross >= 14 && cross <= 40) {
      return { kind: 'apron', base: a.base, along, cross };
    }
    // flat grass margin + smooth blend back into the terrain
    const dA = Math.max(0, aAbs - (RUN_HALF + 4));
    const dC = cross < -9 ? -9 - cross : (cross > 42 ? cross - 42 : 0);
    const d = Math.max(dA, dC);
    if (d < BLEND_R) {
      const t = 1 - d / BLEND_R;
      if (!bestBlend || t > bestBlend.blend) bestBlend = { kind: 'blend', base: a.base, blend: t };
    }
  }
  return bestBlend;
}

// is this column paved airport surface? (runway / taxiway / apron)
// — runway-only aircraft need this under their wheels at touchdown
export function pavedAt(x, z) {
  const apt = airportAt(Math.round(x), Math.round(z));
  return !!apt && apt.kind !== 'blend';
}

// Fast path used by physics every frame: terrain surface height in blocks.
export function heightAt(x, z) {
  const apt = airportAt(Math.round(x), Math.round(z));
  if (apt) {
    if (apt.kind !== 'blend') return apt.base;
    return Math.round(rawHeightAt(x, z) * (1 - apt.blend) + apt.base * apt.blend);
  }
  return rawHeightAt(x, z);
}

// land height curve: linear lowlands + a quadratic term that makes the big
// ranges tower (Everest tops out around 16 km of display altitude), with
// fractal roughness that grows jagged in the high country and ridged noise
// that pulls the uplands into proper crests and valleys
function landHeight(e, n, rdg) {
  const base = Math.max(0, e - 128);
  let h = base * 1.05 + base * base * 0.0035;
  if (base > 12) h += (base - 12) * rdg * rdg * 1.15;
  const rough = 2 + base * 0.18;
  return Math.max(1, Math.round(h + (n - 0.5) * 2 * rough));
}

// 0..1, peaks along noise "creases" — the spine lines of mountain ridges
// (cell must divide WORLD_W so the noise tiles seamlessly at the antimeridian)
function ridgeNoise(x, z) {
  return 1 - Math.abs(2 * vnoise(x, z, 128, 71) - 1);
}

function rawHeightAt(x, z) {
  const [rx, ry] = rasterCoords(x, z);
  const e = bilinear(elevR, rx, ry);
  const m = bilinear(maskR, rx, ry);
  const n = fbm(x, z, 1);
  const land = m + (n - 0.5) * 0.3 > 0.5;
  if (land) return landHeight(e, n, ridgeNoise(x, z));
  return Math.min(-1, Math.round((e - 128) * 0.16 - 1 + (n - 0.5) * 2));
}

// Full column info used by the chunk mesher.
const COL = { h: 0, water: false, top: [0, 0, 0], side: [0, 0, 0], tree: 0, bld: 0, house: 0 };

export function column(x, z) {
  const c = COL;
  c.tree = 0; c.bld = 0; c.house = 0;

  const apt = airportAt(x, z);
  if (apt && apt.kind === 'runway') {
    const jit = 0.96 + hash2(x, z, 5) * 0.08;
    c.h = apt.base; c.water = false;
    const aAbs = Math.abs(apt.along);
    // piano-key threshold bars at both ends
    const piano = aAbs >= RUN_HALF - 8 && aAbs <= RUN_HALF - 3 && (apt.cross % 2 === 0);
    // dashed centerline
    const centerline = apt.cross === 0 && aAbs < RUN_HALF - 12 && ((apt.along + RUN_HALF) % 8) < 4;
    // touchdown-zone stripes either side of the centerline
    const tdz = aAbs >= 48 && aAbs <= 62 && (Math.abs(apt.cross) === 2 || Math.abs(apt.cross) === 3) &&
      ((apt.along + RUN_HALF) % 4) < 2;
    // solid aiming-point bars
    const aim = aAbs >= 64 && aAbs <= 70 && Math.abs(apt.cross) >= 1 && Math.abs(apt.cross) <= 2;
    // continuous white edge stripes
    const edge = Math.abs(apt.cross) === 5 && aAbs <= RUN_HALF - 1;
    c.top = (piano || centerline || tdz || aim) ? [0.93, 0.93, 0.95]
      : edge ? [0.62 * jit, 0.62 * jit, 0.64 * jit]
      : [0.17 * jit, 0.17 * jit, 0.18 * jit];
    c.side = [0.3, 0.3, 0.3];
    return c;
  }
  if (apt && apt.kind === 'taxiway') {
    const jit = 0.95 + hash2(x, z, 5) * 0.09;
    c.h = apt.base; c.water = false;
    // dashed yellow taxi line down the parallel taxiway + connector centerlines
    const taxiLine = (apt.cross === 10 && ((apt.along + RUN_HALF) % 3) < 2) ||
      (apt.cross >= 6 && apt.cross <= 8 && (((apt.along + 84) % 42) + 42) % 42 === 0);
    c.top = taxiLine ? [0.78 * jit, 0.66 * jit, 0.2 * jit] : [0.24 * jit, 0.24 * jit, 0.25 * jit];
    c.side = [0.32, 0.32, 0.33];
    return c;
  }
  if (apt && apt.kind === 'apron') {
    const jit = 0.94 + hash2(x, z, 5) * 0.1;
    c.h = apt.base; c.water = false;
    // concrete with darker expansion joints
    const joint = ((apt.along % 6) + 6) % 6 === 0 || ((apt.cross % 4) + 4) % 4 === 0;
    c.top = joint ? [0.44 * jit, 0.44 * jit, 0.47 * jit] : [0.55 * jit, 0.55 * jit, 0.58 * jit];
    c.side = [0.42, 0.42, 0.44];
    // helipad: dark circle, white ring and a blocky H
    const hA = apt.along + 52, hC = apt.cross - 22; // pad center at (-52, 22)
    const hD = Math.sqrt(hA * hA + hC * hC);
    if (hD <= 6) {
      const ring = hD > 4.5;
      const hBar = (Math.abs(hC) === 2 && Math.abs(hA) <= 2) || (hA === 0 && Math.abs(hC) < 2);
      c.top = (ring || hBar) ? [0.93, 0.93, 0.95] : [0.2 * jit, 0.21 * jit, 0.23 * jit];
      return c;
    }
    if (apt.along >= -40 && apt.along <= 26 && apt.cross >= 34 && apt.cross <= 38) c.bld = 5;  // pier terminal
    else if (apt.along >= -38 && apt.along <= 24 && apt.cross >= 30 && apt.cross <= 33 &&
             ((apt.along + 38) % 8) < 2) c.bld = 3;                                            // jet bridges
    else if (apt.along >= 32 && apt.along <= 33 && apt.cross >= 36 && apt.cross <= 37) c.bld = 22; // control tower
    else if (apt.along >= 40 && apt.along <= 62 && ((apt.along - 40) % 8) < 6 &&
             apt.cross >= 28 && apt.cross <= 36) c.bld = 7;                                    // triple hangars
    else if (apt.along >= -64 && apt.along <= -56 && apt.cross >= 30 && apt.cross <= 34 &&
             ((apt.along % 3) + 3) % 3 === 0 && apt.cross % 3 === 0) c.bld = 3;                // fuel farm tanks
    return c;
  }

  const [rx, ry, lat] = rasterCoords(x, z);
  const e = bilinear(elevR, rx, ry);
  const m = bilinear(maskR, rx, ry);
  const n = fbm(x, z, 1);
  const land = m + (n - 0.5) * 0.3 > 0.5;

  if (!land) {
    c.h = Math.min(-1, Math.round((e - 128) * 0.16 - 1 + (n - 0.5) * 2));
    c.water = true;
    if (apt) { // blend zone reclaims shallow water as ground
      const h = Math.round(c.h * (1 - apt.blend) + apt.base * apt.blend);
      if (h >= 1) {
        c.h = h; c.water = false;
        c.top = [0.62, 0.62, 0.5]; c.side = c.top;
        return c;
      }
      c.h = h;
    }
    // turquoise shallows fading into deep ocean blue
    const d = Math.min(1, -c.h / 14);
    c.top = [0.36 - d * 0.23, 0.62 - d * 0.32, 0.62 - d * 0.12];
    c.side = c.top;
    return c;
  }

  let h = landHeight(e, n, ridgeNoise(x, z));
  if (apt) h = Math.max(1, Math.round(h * (1 - apt.blend) + apt.base * apt.blend));
  c.h = h; c.water = false;

  const alat = Math.abs(lat);
  const clim = climR[(Math.min(RH - 1, Math.floor(ry)) * RW + (((Math.floor(rx) % RW) + RW) % RW))];
  const hum = vnoise(x, z, 512, 91) * 0.7 + vnoise(x, z, 128, 92) * 0.3;
  const jit = 0.92 + hash2(x, z, 5) * 0.14;

  let top, side = [0.45 * jit, 0.33 * jit, 0.22 * jit], treeP = 0, treeType = 1;
  const coastal = m < 0.62;

  let flowers = 0;
  if (clim === 3 || alat > 64 + n * 5) {                       // ice / polar
    top = [0.91, 0.93, 0.97]; treeP = 0;
  } else if (clim === 1 || (alat > 14 && alat < 36 && hum < 0.42 && clim !== 2)) { // desert
    top = [0.93 * jit, 0.8 * jit, 0.48 * jit]; side = top;
    treeP = 0.003; treeType = 4;
  } else if (alat > 56) {                                      // tundra
    top = [0.55 * jit, 0.6 * jit, 0.44 * jit]; treeP = 0.004; treeType = 2;
  } else if (alat > 46) {                                      // taiga
    top = [0.2 * jit, 0.48 * jit, 0.26 * jit]; treeP = 0.06; treeType = 2;
  } else if (clim === 2 || (alat < 13 && hum > 0.42)) {        // rainforest
    top = [0.09 * jit, 0.52 * jit, 0.11 * jit]; treeP = 0.11; treeType = 3;
  } else if (alat < 24 && hum < 0.52) {                        // savanna
    top = [0.74 * jit, 0.63 * jit, 0.24 * jit]; treeP = 0.008; treeType = 5;
    flowers = 0.01;
  } else {                                                     // temperate
    top = [0.32 * jit, 0.68 * jit, 0.22 * jit]; treeP = 0.028; treeType = 1;
    flowers = 0.02;
  }

  // alpine gradient: vegetation dries toward scree as the ground climbs
  if (treeP > 0 && h > 24) {
    const f = Math.min(1, (h - 24) / 34);
    top = [top[0] + (0.55 - top[0]) * f, top[1] + (0.48 - top[1]) * f, top[2] + (0.34 - top[2]) * f];
    treeP *= 1 - f;
    flowers *= 1 - f;
  }
  if (h > 48 + n * 30) { top = [0.52 * jit, 0.49 * jit, 0.47 * jit]; side = top; treeP = 0; flowers = 0; } // rock
  if (h > 80 + n * 20 || (clim === 3)) { top = [0.93, 0.95, 1.0]; treeP = 0; flowers = 0; }                // snowcap
  if (h <= 2 && coastal && clim !== 3 && alat < 60) {                                                      // beach
    top = [0.92 * jit, 0.84 * jit, 0.56 * jit]; side = top;
    treeP = alat < 25 ? 0.015 : 0; treeType = 3;
    flowers = 0;
  }
  // wildflower speckles in the meadows
  if (flowers > 0 && h > 1) {
    const fh = hash2(x, z, 77);
    if (fh < flowers) {
      const pick = hash2(x, z, 78);
      top = pick < 0.34 ? [0.9, 0.25, 0.3] : pick < 0.67 ? [0.95, 0.85, 0.3] : [0.75, 0.4, 0.9];
    }
  }

  c.top = top; c.side = side;

  // keep the approach path clear: no trees or towers next to a runway
  if (apt) return c;

  // cities: road grid + skyscraper core + suburbs of little houses
  const city = cityAt(x, z);
  if (city && h >= 1 && h < 30) {
    const road = ((city.dx % 7) + 7) % 7 === 0 || ((city.dz % 7) + 7) % 7 === 0;
    if (road) {
      c.top = [0.19, 0.19, 0.21]; c.side = [0.3, 0.3, 0.3];
      return c;
    }
    // buildings occupy 2x2-block lots so towers come out chunky
    const cellX = Math.floor(city.dx / 2), cellZ = Math.floor(city.dz / 2);
    const exists = hash2(cellX, cellZ, 740 + city.i) < 0.18 + city.f * 0.45;
    if (exists) {
      const hh = hash2(cellX, cellZ, 741 + city.i);
      if (city.f > 0.55) c.bld = 8 + Math.floor(hh * (8 + city.f * 42)); // downtown skyscrapers
      else if (city.f > 0.3) c.bld = 3 + Math.floor(hh * 8);             // midtown blocks
      else c.house = 2 + (hh < 0.3 ? 1 : 0);                             // suburbs
      return c;
    }
    treeP *= 0.2; // the odd park tree
  } else if (h >= 1 && h <= 26 && clim !== 3) {
    // villages: a dirt crossroads, houses around it
    const vil = villageAt(x, z);
    if (vil) {
      if (vil.dx === 0 || vil.dz === 0) {
        c.top = [0.52, 0.42, 0.3]; c.side = [0.45, 0.36, 0.26];
        return c;
      }
      if (vil.dist < VILLAGE_R - 1 && hash2(x, z, 61) < 0.16) {
        c.house = 2 + (hash2(x, z, 62) < 0.3 ? 1 : 0);
        return c;
      }
      treeP *= 0.4;
    }
  }

  if (treeP > 0 && h > 1 && hash2(x, z, 9) < treeP) c.tree = treeType;
  return c;
}

const CITY_R = 36; // blocks
const cityXZ = [];
export function initCities() {
  for (const [lon, lat] of CITIES) cityXZ.push([Math.round(lonToX(lon)), Math.round(latToZ(lat))]);
}

// nearest city influence; dx/dz are integer offsets from the city centre so
// road grids and building lots stay aligned across chunk borders
function cityAt(x, z) {
  const xw = ((x % WORLD_W) + WORLD_W) % WORLD_W;
  let best = null;
  for (let i = 0; i < cityXZ.length; i++) {
    let dx = xw - cityXZ[i][0];
    if (dx > WORLD_W / 2) dx -= WORLD_W;
    if (dx < -WORLD_W / 2) dx += WORLD_W;
    if (dx > CITY_R || dx < -CITY_R) continue;
    const dz = z - cityXZ[i][1];
    if (dz > CITY_R || dz < -CITY_R) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < CITY_R) {
      const f = 1 - d / CITY_R;
      if (!best || f > best.f) best = { f, dx: Math.round(dx), dz: Math.round(dz), i };
    }
  }
  return best;
}

// villages: one per ~160x160 cell with a coin flip, jittered away from edges
const VCELL = 160, VILLAGE_R = 12;
function villageAt(x, z) {
  const xw = ((x % WORLD_W) + WORLD_W) % WORLD_W;
  const cx = Math.floor(xw / VCELL), cz = Math.floor(z / VCELL);
  if (hash2(cx, cz, 55) > 0.32) return null;
  const vx = cx * VCELL + 14 + Math.floor(hash2(cx, cz, 56) * (VCELL - 28));
  const vz = cz * VCELL + 14 + Math.floor(hash2(cx, cz, 57) * (VCELL - 28));
  const dx = xw - vx, dz = z - vz;
  if (dx > VILLAGE_R || dx < -VILLAGE_R || dz > VILLAGE_R || dz < -VILLAGE_R) return null;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > VILLAGE_R) return null;
  return { dx, dz, dist };
}

// 0..1 "are there people here" — used to spawn walking NPCs
export function populationAt(x, z) {
  const city = cityAt(x, z);
  let p = city ? city.f : 0;
  const vil = villageAt(x, z);
  if (vil) p = Math.max(p, (1 - vil.dist / VILLAGE_R) * 0.9);
  return p;
}

// ---------------------------------------------------------------- minimap
export function drawMapTo(ctx, w, h) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const ry = (y + 0.5) / h * RH;
    const lat = 90 - (y + 0.5) / h * 180;
    for (let x = 0; x < w; x++) {
      const rx = (x + 0.5) / w * RW;
      const i = (Math.min(RH - 1, Math.floor(ry)) * RW + Math.floor(rx) % RW);
      const e = elevR[i];
      let r, g, b;
      if (!maskR[i]) {
        const depth = Math.min(1, (128 - e) / 90);
        r = 24 + (1 - depth) * 40; g = 80 + (1 - depth) * 60; b = 150 + (1 - depth) * 60;
      } else if (climR[i] === 3 || Math.abs(lat) > 64) {
        r = 235; g = 240; b = 246;
      } else if (e > 185) {
        r = 150; g = 130; b = 110;
      } else if (climR[i] === 1) {
        r = 214; g = 190; b = 128;
      } else if (climR[i] === 2) {
        r = 36; g = 110; b = 36;
      } else {
        const t = (e - 128) / 60;
        r = 80 + t * 60; g = 150 - t * 30; b = 66;
      }
      const o = (y * w + x) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
