// Curated set of well-known OSRS place names and their approximate world-tile
// centers, used to render map labels similar to the OSRS Wiki / explv map.
// Coordinates are best-effort approximations of each location's central point,
// not exact game data - nudge x/y here if a label looks off after zooming in.
//
// `tier` controls label size/weight, mirroring explv's map (bigger/bolder for
// cities, smaller for guilds/minigames/landmarks):
//   0 = major city        (Varrock, Falador, Ardougne...)
//   1 = town / district    (Catherby, Taverley, Barbarian Village...)
//   2 = guild / minigame / landmark (Warriors' Guild, Duel Arena...)
export type OsrsLocation = {
  name: string;
  x: number;
  y: number;
  tier: 0 | 1 | 2;
};

export const OSRS_LOCATIONS: OsrsLocation[] = [
  // Major cities
  { name: "Lumbridge", x: 3222, y: 3218, tier: 0 },
  { name: "Varrock", x: 3212, y: 3427, tier: 0 },
  { name: "Falador", x: 2964, y: 3379, tier: 0 },
  { name: "Ardougne", x: 2662, y: 3306, tier: 0 },
  { name: "Camelot", x: 2757, y: 3487, tier: 0 },
  { name: "Yanille", x: 2606, y: 3093, tier: 0 },
  { name: "Prifddinas", x: 2242, y: 3348, tier: 0 },
  { name: "Al Kharid", x: 3293, y: 3182, tier: 0 },
  { name: "Rellekka", x: 2653, y: 3665, tier: 0 },

  // Towns / districts
  { name: "West Ardougne", x: 2530, y: 3312, tier: 1 },
  { name: "Port Sarim", x: 3027, y: 3247, tier: 1 },
  { name: "Draynor Village", x: 3092, y: 3247, tier: 1 },
  { name: "Edgeville", x: 3094, y: 3491, tier: 1 },
  { name: "Barbarian Village", x: 3082, y: 3421, tier: 1 },
  { name: "Catherby", x: 2808, y: 3441, tier: 1 },
  { name: "Seers' Village", x: 2725, y: 3487, tier: 1 },
  { name: "Taverley", x: 2884, y: 3438, tier: 1 },
  { name: "Burthorpe", x: 2900, y: 3538, tier: 1 },
  { name: "Rimmington", x: 2954, y: 3222, tier: 1 },
  { name: "Canifis", x: 3494, y: 3488, tier: 1 },
  { name: "Musa Point", x: 2932, y: 3149, tier: 1 },
  { name: "Brimhaven", x: 2762, y: 3160, tier: 1 },
  { name: "Shilo Village", x: 2849, y: 2999, tier: 1 },
  { name: "Tree Gnome Stronghold", x: 2461, y: 3444, tier: 1 },
  { name: "Trollheim", x: 2890, y: 3679, tier: 1 },
  { name: "Nardah", x: 3423, y: 2917, tier: 1 },
  { name: "Pollnivneach", x: 3358, y: 2965, tier: 1 },
  { name: "Sophanem", x: 3287, y: 2755, tier: 1 },
  { name: "Menaphos", x: 3181, y: 2745, tier: 1 },
  { name: "Mort'ton", x: 3492, y: 3271, tier: 1 },
  { name: "Burgh de Rott", x: 3423, y: 3212, tier: 1 },
  { name: "Meiyerditch", x: 3618, y: 3251, tier: 1 },
  { name: "Port Phasmatys", x: 3679, y: 3489, tier: 1 },
  { name: "Harmony Island", x: 3797, y: 2853, tier: 1 },
  { name: "Ape Atoll", x: 2754, y: 2784, tier: 1 },
  { name: "Piscatoris", x: 2335, y: 3688, tier: 1 },
  { name: "Gnome Village", x: 2536, y: 3170, tier: 1 },
  { name: "Corsair Cove", x: 2555, y: 2872, tier: 1 },
  { name: "Mos Le'Harmless", x: 3695, y: 2925, tier: 1 },
  { name: "Etceteria", x: 2374, y: 3873, tier: 1 },
  { name: "Miscellania", x: 2536, y: 3862, tier: 1 },
  { name: "Waterbirth Island", x: 2523, y: 3735, tier: 1 },
  { name: "Jatizso", x: 2410, y: 3798, tier: 1 },
  { name: "Neitiznot", x: 2338, y: 3792, tier: 1 },
  { name: "Lletya", x: 2337, y: 3169, tier: 1 },
  { name: "Zul-Andra", x: 2160, y: 3070, tier: 1 },
  { name: "Castle Wars", x: 2440, y: 3092, tier: 1 },
  { name: "Feldip Hills", x: 2560, y: 2900, tier: 1 },
  { name: "Uzer", x: 3455, y: 3095, tier: 1 },
  { name: "Draynor Manor", x: 3108, y: 3355, tier: 1 },
  { name: "Wilderness", x: 3160, y: 3680, tier: 1 },

  // Guilds, minigames, and other landmarks
  { name: "Warriors' Guild", x: 2877, y: 3543, tier: 2 },
  { name: "Champions' Guild", x: 3189, y: 3358, tier: 2 },
  { name: "Legends' Guild", x: 2731, y: 3160, tier: 2 },
  { name: "Crafting Guild", x: 2933, y: 3285, tier: 2 },
  { name: "Cooking Guild", x: 3143, y: 3444, tier: 2 },
  { name: "Fishing Guild", x: 2611, y: 3409, tier: 2 },
  { name: "Mining Guild", x: 3046, y: 3335, tier: 2 },
  { name: "Farming Guild", x: 1249, y: 3739, tier: 2 },
  { name: "Woodcutting Guild", x: 1595, y: 3488, tier: 2 },
  { name: "Grand Exchange", x: 3164, y: 3477, tier: 2 },
  { name: "Varrock Palace", x: 3213, y: 3473, tier: 2 },
  { name: "Wizards' Tower", x: 3109, y: 3162, tier: 2 },
  { name: "Duel Arena", x: 3364, y: 3271, tier: 2 },
  { name: "Clan Wars", x: 3358, y: 3160, tier: 2 },
  { name: "Barrows", x: 3565, y: 3287, tier: 2 },
  { name: "Goblin Village", x: 2957, y: 3508, tier: 2 },
  { name: "Dwarven Mine", x: 3020, y: 3450, tier: 2 },
  { name: "White Wolf Mountain", x: 2840, y: 3495, tier: 2 },
  { name: "Ice Mountain", x: 3025, y: 3480, tier: 2 },
  { name: "Lumbridge Swamp", x: 3200, y: 3170, tier: 2 },
  { name: "Digsite", x: 3345, y: 3407, tier: 2 },
  { name: "Monastery", x: 3053, y: 3489, tier: 2 },
  { name: "Karamja Volcano", x: 2860, y: 3160, tier: 2 },
  { name: "Brimhaven Dungeon", x: 2711, y: 3151, tier: 2 },
  { name: "Tai Bwo Wannai", x: 2792, y: 3080, tier: 2 },
  { name: "Otto's Grotto", x: 2500, y: 3488, tier: 2 },
  { name: "Jiggig", x: 2477, y: 2988, tier: 2 },
  { name: "Land's End", x: 2337, y: 3033, tier: 2 },
];
