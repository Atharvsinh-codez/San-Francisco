import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PUBLIC_DATA_DIR, ensureDirs } from './fetch.ts';
import { BakedTerrainSampler } from './terrain.ts';
import { latLonToENU, round1 } from '../src/world/coords.ts';

export interface HeroLandmarkSpec {
  id: string;
  name: string;
  category: 'bridge' | 'tower' | 'skyscraper' | 'monument' | 'stadium' | 'historic' | 'scenic' | 'university';
  lat: number;
  lon: number;
  x: number;
  baseY: number;
  z: number;
  heightM: number;
  headingDeg: number;
  flyDistM: number;
  flyPitchDeg: number;
  flyHeadingDeg: number;
  description: string;
  aliases: string[];
}

export async function bakeLandmarks(): Promise<void> {
  ensureDirs();
  const terrain = new BakedTerrainSampler();

  const specsRaw: Omit<HeroLandmarkSpec, 'x' | 'baseY' | 'z'>[] = [
    {
      id: 'golden-gate-bridge',
      name: 'Golden Gate Bridge',
      category: 'bridge',
      lat: 37.8199,
      lon: -122.4783,
      heightM: 227.4,
      headingDeg: -6.5,
      flyDistM: 1150,
      flyPitchDeg: -18,
      flyHeadingDeg: 128,
      description: '1,280 m main suspension span, 227 m Art Deco towers in International Orange (#F04A00), Fort Point beneath south arch.',
      aliases: ['golden gate', 'ggb', 'fort point', 'marin headlands'],
    },
    {
      id: 'bay-bridge',
      name: 'San Francisco–Oakland Bay Bridge',
      category: 'bridge',
      lat: 37.7983,
      lon: -122.3778,
      heightM: 160.3,
      headingDeg: 48,
      flyDistM: 1350,
      flyPitchDeg: -20,
      flyHeadingDeg: 65,
      description: 'Twin western suspension spans to Yerba Buena Island + eastern single-tower Self-Anchored Suspension (SAS) span.',
      aliases: ['bay bridge', 'oakland bridge', 'yerba buena', 'treasure island'],
    },
    {
      id: 'salesforce-tower',
      name: 'Salesforce Tower',
      category: 'tower',
      lat: 37.7897,
      lon: -122.3969,
      heightM: 326.0,
      headingDeg: 0,
      flyDistM: 520,
      flyPitchDeg: -22,
      flyHeadingDeg: 310,
      description: 'Tallest skyscraper in San Francisco (326 m / 1,070 ft), tapered glass obelisk with illuminated night LED crown.',
      aliases: ['salesforce', 'transbay', 'fidi'],
    },
    {
      id: 'transamerica-pyramid',
      name: 'Transamerica Pyramid',
      category: 'tower',
      lat: 37.7952,
      lon: -122.4028,
      heightM: 260.0,
      headingDeg: 9,
      flyDistM: 460,
      flyPitchDeg: -22,
      flyHeadingDeg: 235,
      description: 'Iconic 260 m quartet-winged modernist quartz-aggregate pyramid with glass-capped beacon spire.',
      aliases: ['transamerica', 'pyramid', 'montgomery'],
    },
    {
      id: 'coit-tower',
      name: 'Coit Tower',
      category: 'monument',
      lat: 37.8024,
      lon: -122.4058,
      heightM: 64.0,
      headingDeg: 0,
      flyDistM: 280,
      flyPitchDeg: -20,
      flyHeadingDeg: 295,
      description: '1933 fluted white Art Deco concrete column crowning Telegraph Hill with 360° belvedere observation deck.',
      aliases: ['coit', 'telegraph hill', 'pioneer park'],
    },
    {
      id: 'sutro-tower',
      name: 'Sutro Tower',
      category: 'tower',
      lat: 37.7552,
      lon: -122.4528,
      heightM: 297.8,
      headingDeg: 0,
      flyDistM: 550,
      flyPitchDeg: -18,
      flyHeadingDeg: 240,
      description: '298 m three-legged red-and-white lattice broadcast super-tower atop Mount Sutro.',
      aliases: ['sutro', 'antenna', 'mount sutro', 'radio tower'],
    },
    {
      id: 'palace-of-fine-arts',
      name: 'Palace of Fine Arts',
      category: 'monument',
      lat: 37.8029,
      lon: -122.4484,
      heightM: 49.0,
      headingDeg: 90,
      flyDistM: 260,
      flyPitchDeg: -20,
      flyHeadingDeg: 265,
      description: '1915 Panama-Pacific Greco-Roman rotunda dome, curved Corinthian colonnade, and reflecting lagoon.',
      aliases: ['palace of fine arts', 'rotunda', 'marina'],
    },
    {
      id: 'ferry-building',
      name: 'San Francisco Ferry Building',
      category: 'historic',
      lat: 37.7955,
      lon: -122.3937,
      heightM: 74.7,
      headingDeg: -35,
      flyDistM: 320,
      flyPitchDeg: -20,
      flyHeadingDeg: 245,
      description: '1898 Beaux-Arts waterfront terminal with 245 ft Seville-inspired clock tower along the Embarcadero.',
      aliases: ['ferry building', 'embarcadero', 'clock tower'],
    },
    {
      id: 'alcatraz-island',
      name: 'Alcatraz Island',
      category: 'historic',
      lat: 37.8267,
      lon: -122.4230,
      heightM: 41.0,
      headingDeg: -30,
      flyDistM: 480,
      flyPitchDeg: -24,
      flyHeadingDeg: 35,
      description: 'Main Cellhouse, historic 1854 Alcatraz Lighthouse, Water Tower, and guard fortifications in SF Bay.',
      aliases: ['alcatraz', 'the rock', 'prison', 'lighthouse'],
    },
    {
      id: 'oracle-park',
      name: 'Oracle Park',
      category: 'stadium',
      lat: 37.7786,
      lon: -122.3893,
      heightM: 46.0,
      headingDeg: 45,
      flyDistM: 420,
      flyPitchDeg: -28,
      flyHeadingDeg: 320,
      description: 'Brick waterfront ballpark at China Basin / McCovey Cove with open bay views and light towers.',
      aliases: ['oracle park', 'giants stadium', 'att park', 'pacbell', 'mccovey cove'],
    },
    {
      id: 'chase-center',
      name: 'Chase Center',
      category: 'stadium',
      lat: 37.7680,
      lon: -122.3877,
      heightM: 42.0,
      headingDeg: 0,
      flyDistM: 380,
      flyPitchDeg: -24,
      flyHeadingDeg: 290,
      description: 'Modern cylindrical Mission Bay arena complex with public waterfront plaza.',
      aliases: ['chase center', 'warriors', 'mission bay'],
    },
    {
      id: 'city-hall',
      name: 'San Francisco City Hall',
      category: 'historic',
      lat: 37.7793,
      lon: -122.4193,
      heightM: 93.7,
      headingDeg: 9,
      flyDistM: 320,
      flyPitchDeg: -22,
      flyHeadingDeg: 279,
      description: '1915 Beaux-Arts monument at ENU Origin (0,0) featuring the 5th-tallest Baroque dome in the world (93.7 m).',
      aliases: ['city hall', 'civic center', 'origin'],
    },
    {
      id: 'grace-cathedral',
      name: 'Grace Cathedral',
      category: 'historic',
      lat: 37.7919,
      lon: -122.4130,
      heightM: 52.0,
      headingDeg: 9,
      flyDistM: 250,
      flyPitchDeg: -22,
      flyHeadingDeg: 100,
      description: 'French Gothic cathedral atop Nob Hill with twin bell towers, rose window, and gilded spire.',
      aliases: ['grace cathedral', 'nob hill', 'huntington park'],
    },
    {
      id: 'painted-ladies',
      name: 'Painted Ladies (Postcard Row)',
      category: 'historic',
      lat: 37.7763,
      lon: -122.4328,
      heightM: 14.5,
      headingDeg: 9,
      flyDistM: 150,
      flyPitchDeg: -16,
      flyHeadingDeg: 85,
      description: 'Iconic row of 7 Victorian Queen Anne houses at 710–722 Steiner Street facing Alamo Square Park with downtown skyline backdrop.',
      aliases: ['painted ladies', 'alamo square', 'steiner street', 'full house'],
    },
    {
      id: 'lombard-street',
      name: 'Lombard Street (Crooked Block)',
      category: 'scenic',
      lat: 37.8021,
      lon: -122.4187,
      heightM: 12.0,
      headingDeg: 9,
      flyDistM: 180,
      flyPitchDeg: -28,
      flyHeadingDeg: 279,
      description: 'Eight tight red-brick hairpin switchbacks descending a 27% Russian Hill grade between Hyde and Leavenworth, lined with manicured hydrangea hedges.',
      aliases: ['lombard', 'crooked street', 'switchbacks', 'russian hill'],
    },
    {
      id: 'pier-39',
      name: 'Pier 39 & Fisherman’s Wharf',
      category: 'scenic',
      lat: 37.8087,
      lon: -122.4098,
      heightM: 16.0,
      headingDeg: 30,
      flyDistM: 340,
      flyPitchDeg: -24,
      flyHeadingDeg: 210,
      description: 'Timber-piling festival pier complex, marina slips, sea lion docks, and historic Embarcadero finger piers.',
      aliases: ['pier 39', 'fishermans wharf', 'piers', 'embarcadero'],
    },
    {
      id: 'twin-peaks',
      name: 'Twin Peaks Lookout',
      category: 'scenic',
      lat: 37.7544,
      lon: -122.4477,
      heightM: 18.0,
      headingDeg: 45,
      flyDistM: 360,
      flyPitchDeg: -16,
      flyHeadingDeg: 55,
      description: 'Christmas Tree Point panoramic overlook at 280 m elevation looking straight down Market Street to the Bay.',
      aliases: ['twin peaks', 'lookout', 'christmas tree point'],
    },
    {
      id: 'ocean-beach',
      name: 'Ocean Beach & Cliff House',
      category: 'scenic',
      lat: 37.7755,
      lon: -122.5135,
      heightM: 15.0,
      headingDeg: 0,
      flyDistM: 500,
      flyPitchDeg: -18,
      flyHeadingDeg: 95,
      description: 'Pacific coastline surf zone with rolling whitewater breakers, Golden Gate Park windmills, and Lands End cliffs.',
      aliases: ['ocean beach', 'lands end', 'pacific ocean', 'cliff house'],
    },
    {
      id: 'usf-campus',
      name: 'University of San Francisco (USF)',
      category: 'historic',
      lat: 37.7766,
      lon: -122.4507,
      heightM: 64.0,
      headingDeg: 9,
      flyDistM: 340,
      flyPitchDeg: -22,
      flyHeadingDeg: 35,
      description: 'St. Ignatius Church twin Baroque spires, Lone Mountain Spanish Revival campus, Kalmanovitz Hall, and Gleeson Library.',
      aliases: ['usf', 'university of san francisco', 'st ignatius', 'lone mountain', 'university'],
    },
    {
      id: 'ucsf-parnassus',
      name: 'UCSF Parnassus Heights',
      category: 'skyscraper',
      lat: 37.7631,
      lon: -122.4582,
      heightM: 78.0,
      headingDeg: -8,
      flyDistM: 380,
      flyPitchDeg: -22,
      flyHeadingDeg: 185,
      description: 'UCSF Medical Center, Health Sciences West & East 16-story research towers, and Kalmanovitz Library on Mount Sutro.',
      aliases: ['ucsf', 'parnassus', 'ucsf medical center', 'mount sutro', 'university'],
    },
    {
      id: 'ucsf-mission-bay',
      name: 'UCSF Mission Bay Campus',
      category: 'historic',
      lat: 37.7678,
      lon: -122.3918,
      heightM: 52.0,
      headingDeg: 0,
      flyDistM: 360,
      flyPitchDeg: -22,
      flyHeadingDeg: 280,
      description: 'Genentech Hall sandstone dome, Helen Diller Cancer Research Building, Byers Hall, and Koret Quad.',
      aliases: ['ucsf mission bay', 'genentech hall', 'mission bay university'],
    },
    {
      id: 'sfsu-campus',
      name: 'San Francisco State University (SFSU)',
      category: 'historic',
      lat: 37.7228,
      lon: -122.4782,
      heightM: 46.0,
      headingDeg: 0,
      flyDistM: 380,
      flyPitchDeg: -24,
      flyHeadingDeg: 45,
      description: 'J. Paul Leonard Library, Cesar Chavez Student Center pyramids, Thornton Science Hall, and Malcolm X Plaza.',
      aliases: ['sfsu', 'san francisco state university', 'sf state', 'lake merced'],
    },
    {
      id: 'uc-law-sf',
      name: 'UC Law San Francisco',
      category: 'skyscraper',
      lat: 37.7812,
      lon: -122.4158,
      heightM: 58.0,
      headingDeg: 9,
      flyDistM: 280,
      flyPitchDeg: -22,
      flyHeadingDeg: 250,
      description: 'Cotchett Law Center, 200 McAllister Tower, and Academic Village at Civic Center.',
      aliases: ['uc law', 'uc hastings', 'law school', 'civic center university'],
    },
  ];

  const landmarks: HeroLandmarkSpec[] = specsRaw.map((spec) => {
    const enu = latLonToENU(spec.lat, spec.lon);
    const groundY = terrain.sampleHeight(enu.x, enu.z);
    const baseY =
      spec.category === 'bridge'
        ? 0
        : spec.id === 'pier-39'
          ? 2.8
          : Math.max(1.5, groundY);
    return {
      ...spec,
      x: round1(enu.x),
      baseY: round1(baseY),
      z: round1(enu.z),
    };
  });

  const outPath = path.join(PUBLIC_DATA_DIR, 'landmarks.json');
  fs.writeFileSync(outPath, JSON.stringify({ landmarks }, null, 2));
  console.log(`[bake:landmarks] Baked ${landmarks.length} hero landmark placements aligned to DEM.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bakeLandmarks();
}
