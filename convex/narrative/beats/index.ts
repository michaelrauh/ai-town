import type { Beat } from '../beats';

// Helpers ------------------------------------------------------------------

function hasFlag(state: any, key: string): boolean {
  return Boolean(state.flags?.[key]);
}

function bumpHeart(state: any, name: string, delta: number) {
  state.hearts[name] = (state.hearts[name] ?? 0) + delta;
}

function setFlag(state: any, key: string, value: boolean | string | number) {
  state.flags[key] = value;
}

function giveItem(
  state: any,
  item: {
    itemId: string;
    name: string;
    emoji?: string;
    tags?: string[];
    sellPrice?: number;
    description?: string;
  },
) {
  if (state.inventory.some((existing: { itemId?: string }) => existing.itemId === item.itemId)) {
    return;
  }
  state.inventory.push({
    itemId: item.itemId,
    name: item.name,
    description: item.description,
    emoji: item.emoji,
    tags: item.tags ?? [],
    sellPrice: item.sellPrice,
  });
}

function giveStartingKit(state: any) {
  giveItem(state, {
    itemId: 'hoe',
    name: 'Hoe',
    description: "Grandfather's old hoe.",
    emoji: '🪓',
    tags: ['tool', 'farm'],
    sellPrice: 6,
  });
  giveItem(state, {
    itemId: 'taskbook',
    name: 'Taskbook',
    description: 'Where formal Tasks are recorded.',
    emoji: '📒',
    tags: ['paper', 'curio'],
    sellPrice: 0,
  });
  giveItem(state, {
    itemId: 'journal',
    name: 'Journal',
    description: "Kyle's personal journal.",
    emoji: '📓',
    tags: ['paper', 'curio'],
    sellPrice: 4,
  });
}

// =========================================================================
// DAY 1 — Onboarding
// =========================================================================

const lawyersOffice: Beat = {
  id: 'lawyers-office',
  title: 'Inheritance Papers',
  objective: 'Decide what Kyle does with the inheritance papers.',
  priority: 100,
  preconditions: (s) => s.turn === 0 && s.day === 1,
  openingBriefing: () =>
    "Before all this: a sterile Detroit lawyer's office, leather chairs and shiny table. The lawyer slides papers across to Kyle — his late grandfather has left him a farm in a place called Willow Creek. Kyle's hand hovers over the signature line with a drippy fancy pen. He hasn't seen Grandpa in years.",
  choices: () => [
    { id: 'sign', label: 'Sign the papers' },
    { id: 'hesitate', label: 'Hesitate' },
  ],
  resolve: (state, choiceId) => {
    setFlag(state, 'inheritanceSigned', true);
    state.location = 'kyle-field';
    if (choiceId === 'hesitate') {
      return "Kyle stares at the page for a long beat. Then he signs anyway — there's nothing left for him in Detroit. The ink dries. He stands and steps out onto the crosswalk.";
    }
    return "Kyle signs. The pen scratches across the paper with a finality he didn't expect. He stands, nods to the lawyer, and steps out onto the crosswalk.";
  },
};

const arrival: Beat = {
  id: 'arrival',
  title: 'Arrival in Willow Creek',
  objective: 'Choose how Kyle answers the Mayor.',
  priority: 100,
  preconditions: (s) => hasFlag(s, 'inheritanceSigned') && !s.beatsCompleted.includes('arrival'),
  openingBriefing: () =>
    "Kyle's foot lands not on Detroit pavement but on soft grass. The city sounds vanish. He's standing in a field, weeds to his knees, a small cottage behind him. A short man with a mustache, a monocle, and a big hat is dusting Kyle off and welcoming him. 'You must be Kyle. Your grandfather spoke fondly of you.' This is the Mayor of Willow Creek.",
  choices: () => [
    { id: 'greet', label: 'Greet the Mayor warmly' },
    { id: 'demand', label: 'Demand an explanation' },
    { id: 'silent', label: 'Stand silent, taking it in' },
  ],
  resolve: (state, choiceId) => {
    setFlag(state, 'mayorMet', true);
    bumpHeart(state, 'Mayor', choiceId === 'demand' ? 0 : 1);
    if (choiceId === 'demand')
      return "The Mayor smiles patiently, unbothered by Kyle's edge. 'All in due time. Your grandfather's farm needs you. So does the town.' He gestures to a worn leather knapsack at Kyle's feet.";
    if (choiceId === 'silent')
      return "The Mayor nods, as if used to newcomers needing a beat. He gestures to a worn leather knapsack at Kyle's feet. 'Your grandfather's. Open when you're ready.'";
    return "The Mayor's eyes crinkle. 'Welcome home.' He gestures to a worn leather knapsack at Kyle's feet. 'Your grandfather's. There's a Task to discuss when you're ready.'";
  },
};

const acceptTask: Beat = {
  id: 'accept-task',
  title: 'Fix Up the Forgotten Farm',
  objective: "Respond to the Mayor's formal Task offer.",
  priority: 100,
  preconditions: (s) => hasFlag(s, 'mayorMet') && !s.beatsCompleted.includes('accept-task'),
  openingBriefing: () =>
    "The Mayor produces a small magical-looking Task book and clears his throat formally. 'I, as Mayor of Willow Creek, formally offer you a Task: Fix Up the Forgotten Farm.' His monocle gleams. 'Yes or no, Kyle Farmer. Tasks are binding once accepted.'",
  choices: () => [
    { id: 'yes', label: 'YES — accept the Task' },
    { id: 'no', label: 'NO — refuse' },
  ],
  resolve: (state, choiceId) => {
    state.location = 'kyle-cottage';
    giveStartingKit(state);
    if (choiceId === 'no') {
      // Soft barrier — the player will be offered again. We mark NOTHING completed, but
      // we DO set a flag the next opening will reference.
      setFlag(state, 'taskRefusedOnce', true);
      // Hack: by not marking accept-task completed, the trigger will re-fire next turn.
      // To avoid an infinite loop, we still mark completed but reopen via 'accept-task-retry'.
      // Cleanest: just flag and let the next beat handle it.
      setFlag(state, 'mainTaskAccepted', true); // Accept anyway — story rails. The narration will note the refusal.
      bumpHeart(state, 'Mayor', -1);
      return "Kyle says no. The air shimmers; an invisible barrier hums at the property line. The Mayor smiles patiently. 'I understand. But you have nowhere else to go.' Kyle, claustrophobic, mutters 'fine — yes.' A small chime sounds. The Task is accepted.";
    }
    setFlag(state, 'mainTaskAccepted', true);
    bumpHeart(state, 'Mayor', 1);
    return "Kyle says yes. A small chime sounds. The Mayor beams. 'Excellent. The knapsack is yours — a hoe, a Taskbook, and a journal. Get some rest. Tomorrow your work begins.' He tips his hat and steps away into the long grass.";
  },
};

const firstNight: Beat = {
  id: 'first-night',
  title: 'First Night',
  objective: "Get Kyle through his first night in Grandfather's cottage.",
  priority: 90,
  preconditions: (s) =>
    hasFlag(s, 'mainTaskAccepted') &&
    s.location === 'kyle-cottage' &&
    !s.beatsCompleted.includes('first-night'),
  openingBriefing: () =>
    'The sun is setting fast. Inside the cottage Kyle finds a small bed, a nightstand with the blank blue journal, the trunk, an old TV in the corner. The Taskbook in the knapsack already has his name on the first page. He is exhausted.',
  choices: () => [
    { id: 'sleep', label: 'Go to sleep' },
    { id: 'write', label: 'Write in the journal first' },
  ],
  resolve: (state, choiceId) => {
    // Sleep to morning of Day 2.
    state.day = 2;
    state.clockMinutes = 7 * 60; // 7 AM
    state.timeOfDay = 'morning';
    if (choiceId === 'write') {
      setFlag(state, 'journaledDay1', true);
      return "Kyle scrawls a single sentence: 'Today was a weird day. I hope I can at least get a little sleep.' Then he sleeps. The rooster crows him awake at dawn.";
    }
    return 'Kyle lies down in his clothes and is out before his head settles. The rooster crows him awake at dawn.';
  },
};

// =========================================================================
// DAY 2 — Meeting the town
// =========================================================================

const morningChores: Beat = {
  id: 'morning-chores',
  title: 'Harold at the Farm',
  objective: "Receive Harold's farm supplies.",
  priority: 90,
  preconditions: (s) =>
    s.day === 2 &&
    s.beatsCompleted.includes('first-night') &&
    !s.beatsCompleted.includes('morning-chores'),
  openingBriefing: () =>
    "Kyle is barely outside the cottage when a burly, jovial man with a stubbled chin and enormous arms strides up. 'You must be Kyle! Harold. I knew your grandfather — buy his produce, used to. Pour his drinks too.' He sets down a watering can, a small pouch of poor turnip seeds, and a bundle of thistles. 'These were on the books from your grandpa. They're yours.'",
  choices: () => [
    { id: 'thank', label: 'Thank Harold warmly' },
    { id: 'questions', label: 'Ask Harold about Grandpa' },
    { id: 'work', label: 'Get straight to work' },
  ],
  resolve: (state, choiceId) => {
    giveItem(state, {
      itemId: 'watering-can',
      name: 'Watering can',
      emoji: '🪣',
      tags: ['tool', 'farm'],
      sellPrice: 4,
      description: 'A tin watering can Harold dropped off.',
    });
    giveItem(state, {
      itemId: 'turnip-seeds',
      name: 'Poor turnip seeds',
      emoji: '🌱',
      tags: ['farm', 'seed'],
      sellPrice: 1,
      description: '9 turnip seeds. Not great quality.',
    });
    bumpHeart(state, 'Harold', choiceId === 'work' ? 0 : 1);
    if (choiceId === 'questions') {
      setFlag(state, 'askedHaroldAboutGrandpa', true);
      return "Harold's eyes soften. 'He was the heart of this town for a long while. When he stopped coming, things changed.' He claps Kyle's shoulder. 'You'll see. Come by the inn tonight.'";
    }
    if (choiceId === 'work')
      return "Harold blinks, then grins. 'Right then. I'll be back this afternoon for goods.' He goes.";
    return "Harold grins. 'Good lad. Come by the Willow Branch Inn tonight — I'll buy you a drink.' He's off down the road.";
  },
};

const rescueElvira: Beat = {
  id: 'rescue-elvira',
  title: 'A Noise in the Brambles',
  objective: 'Deal with the thrashing in the brambles.',
  priority: 85,
  preconditions: (s) =>
    s.day === 2 &&
    s.beatsCompleted.includes('morning-chores') &&
    s.location === 'kyle-field' &&
    !s.beatsCompleted.includes('rescue-elvira'),
  openingBriefing: () =>
    'Out in the weeds, Kyle hears thrashing. Something is tangled — a huge dog, beagle-faced but Irish wolfhound-tall, completely snarled in brambles, exhausted. It looks at Kyle with enormous wet eyes.',
  choices: () => [
    { id: 'free', label: 'Carefully free the dog' },
    { id: 'ignore', label: 'Step around, keep working' },
  ],
  resolve: (state, choiceId) => {
    if (choiceId === 'ignore') {
      // She comes back. Story rails.
      setFlag(state, 'elviraRescued', true);
      return "Kyle steps around. But the thrashing keeps catching his ear. He doubles back, sighs, and frees her. She bolts — and then trots back, sits at his feet, tail thumping. Apparently he has a dog now. He decides she's an Elvira.";
    }
    setFlag(state, 'elviraRescued', true);
    bumpHeart(state, 'Elvira' as any, 3);
    return "Kyle works the brambles loose one careful loop at a time. The dog goes still under his hands, as if she knows. When she's free, she bolts — then trots back, sits at his feet, tail thumping. He decides she's an Elvira.";
  },
};

const townVisit: Beat = {
  id: 'town-visit',
  title: 'The Town Square',
  objective: 'Choose who Kyle engages with in Town Square.',
  priority: 80,
  preconditions: (s) =>
    s.day === 2 &&
    s.beatsCompleted.includes('rescue-elvira') &&
    s.location === 'town-square' &&
    !s.beatsCompleted.includes('town-visit'),
  openingBriefing: () =>
    'The town square is pretty in a sad way. Pastel cobbles, some crooked. The great willow tree at the center is sparsely bloomed and brown-spotted. A blue ice cream cart sits to one side, manned by a young man with big watchful eyes — Milo. A white-haired woman in blue robes — Laurel — kneels at a shattered statue pedestal under the willow, meditating. Her glare when Kyle approaches is icy.',
  choices: () => [
    { id: 'milo', label: 'Buy a cone from Milo' },
    { id: 'laurel', label: 'Approach Laurel anyway' },
    { id: 'browse', label: 'Browse the shops' },
  ],
  resolve: (state, choiceId) => {
    if (choiceId === 'milo') {
      bumpHeart(state, 'Milo', 1);
      state.coins -= 3;
      return "Milo brightens. 'Spring berry — first batch of the season.' He hands over a pale-blue cone. 'You're the one from the old farm? Welcome.' He glances at Laurel and lowers his voice. 'Don't bother her at the pedestal. She's been like that since it happened.'";
    }
    if (choiceId === 'laurel') {
      bumpHeart(state, 'Laurel', -1);
      return "Laurel's eyes meet Kyle's. 'Any farmer hoping for a decent harvest won't bother me again.' Her voice is cold but precise. She returns to her meditation as if Kyle had already left.";
    }
    return 'Kyle wanders the perimeter. The shops are quaint and a little shabby. A few townsfolk nod as he passes; one or two whisper.';
  },
};

const mushroomMistake: Beat = {
  id: 'mushroom-mistake',
  title: 'Forest Foraging',
  objective: 'Choose what Kyle eats at the Forest Edge.',
  priority: 75,
  preconditions: (s) =>
    s.day === 2 &&
    s.beatsCompleted.includes('town-visit') &&
    s.location === 'forest-edge' &&
    !s.beatsCompleted.includes('mushroom-mistake'),
  openingBriefing: () =>
    "At the forest edge Kyle spots mushrooms — green ones glowing dimly on a log, red ones speckled and bright on the ground. He's hungry. Elvira nudges him toward the green ones and away from the red, but Kyle's stomach is louder than his dog.",
  choices: () => [
    { id: 'red', label: 'Try a red one — it looks ripest' },
    { id: 'green', label: 'Trust Elvira; eat green' },
    { id: 'skip', label: 'Forage berries instead' },
  ],
  resolve: (state, choiceId) => {
    if (choiceId === 'red') {
      setFlag(state, 'mushroomPoisoned', true);
      bumpHeart(state, 'Laurel', 2); // She saves him — relationship +.
      return 'Within minutes Kyle is on his knees, sweating cold. Elvira bays. Somehow Laurel is there — running up the path, robes flying — pouring something bitter down his throat. The world comes back. She does not speak. She does not need to.';
    }
    if (choiceId === 'green') {
      bumpHeart(state, 'Elvira' as any, 1);
      return 'Kyle eats a green mushroom. Earthy. Not bad. Elvira watches him with what feels like satisfaction. He pockets a few more for later.';
    }
    giveItem(state, {
      itemId: 'spring-berries',
      name: 'Spring Mountain berries',
      emoji: '🫐',
      tags: ['food', 'fruit'],
      sellPrice: 2,
      description: 'A small handful of sour spring berries.',
    });
    return 'Kyle finds a cluster of blue Spring Mountain berries. He fills his pockets. Sour but real food.';
  },
};

const eveningAtInn: Beat = {
  id: 'evening-at-inn',
  title: 'Evening at the Inn',
  objective: 'Spend the evening at the Willow Branch Inn.',
  priority: 70,
  preconditions: (s) =>
    s.day === 2 &&
    s.beatsCompleted.includes('town-visit') &&
    s.location === 'willow-branch-inn' &&
    s.timeOfDay !== 'morning' &&
    !s.beatsCompleted.includes('evening-at-inn'),
  openingBriefing: () =>
    'The inn is warm and a little rowdy. Harold pours from behind the bar. A brunette woman in a leather jacket — Collette — leans on the counter and gives Kyle a sardonic once-over. The Mayor is at a corner table and waves him over. The stew Harold sets down is exactly — exactly — the stew Kyle remembers from twenty years ago.',
  choices: () => [
    { id: 'stew', label: 'Eat the stew and listen to the Mayor' },
    { id: 'ask', label: 'Ask the Mayor what happened to the statue' },
    { id: 'go-home', label: 'Ask the Mayor to send you home to Detroit' },
  ],
  resolve: (state, choiceId) => {
    state.coins -= 8; // stew
    bumpHeart(state, 'Harold', 1);
    if (choiceId === 'ask') {
      setFlag(state, 'askedAboutStatue', true);
      bumpHeart(state, 'Milo', 1);
      return "The Mayor's expression dims. 'A year ago — lightning. The Harvest Queen statue. The town has been... thin since.' Milo, passing with empty mugs, freezes for a beat and looks at the floor.";
    }
    if (choiceId === 'go-home') {
      setFlag(state, 'consideredGoingHome', true);
      bumpHeart(state, 'Mayor', -1);
      return "The Mayor regards Kyle for a long moment, then nods. 'If you wish. I can do that.' He waits. Around the room the warmth seems to dim by a single degree. Kyle, surprising himself, says, 'Never mind.' The Mayor smiles slowly. The room warms back up.";
    }
    return "Kyle eats. The Mayor talks quietly about Grandpa — the original farm, the route between Detroit and Willow Creek, why it's so hard now. Collette refills Kyle's mug without being asked.";
  },
};

// =========================================================================
// DAY 3 — Payoff
// =========================================================================

const firstHarvest: Beat = {
  id: 'first-harvest',
  title: 'First Harvest',
  objective: "Decide what to do with Kyle's first harvest.",
  priority: 70,
  preconditions: (s) =>
    s.day >= 3 &&
    s.beatsCompleted.includes('evening-at-inn') &&
    s.location === 'kyle-field' &&
    !s.beatsCompleted.includes('first-harvest'),
  openingBriefing: () =>
    'The morning of Day 3. The turnips Kyle planted have come up — small, pale, but real. He kneels and pulls the first one. It comes out cleanly. Behind him the shipping bin sits open. Harold will be by this afternoon.',
  choices: () => [
    { id: 'ship', label: 'Ship the harvest to Harold' },
    { id: 'keep', label: 'Keep them for Kyle to eat' },
  ],
  resolve: (state, choiceId) => {
    if (choiceId === 'keep') {
      giveItem(state, {
        itemId: 'turnips',
        name: 'Turnips (9)',
        emoji: '🥬',
        tags: ['food', 'vegetable'],
        sellPrice: 18,
        description: "Kyle's first crop. Small but real.",
      });
      return "Kyle pockets the turnips. Not much, but it's his.";
    }
    state.coins += 18;
    bumpHeart(state, 'Harold', 1);
    return "Kyle drops the turnips in the bin. A small chime sounds. Eighteen gold lands in his account. Harold's voice carries from the road: 'That's the spirit!'";
  },
};

const curseHint: Beat = {
  id: 'curse-hint',
  title: 'The Broken Statue',
  objective: "Listen to Milo's account of the broken statue.",
  priority: 70,
  preconditions: (s) =>
    s.day >= 3 &&
    s.beatsCompleted.includes('first-harvest') &&
    s.location === 'town-square' &&
    !s.beatsCompleted.includes('curse-hint'),
  openingBriefing: () =>
    "Milo is leaning against his ice cream cart watching the willow tree. When Kyle approaches he speaks without turning. 'I was here when the lightning hit. The Harvest Queen statue — gone in one strike. Town's been thin since. Farms don't yield. Animals get sick. Laurel prays at the pedestal every day and she's the only reason any of us are still managing.'",
  choices: () => [
    { id: 'listen', label: 'Listen, ask nothing' },
    { id: 'who-was-she', label: 'Ask who the Harvest Queen was' },
  ],
  resolve: (state, choiceId) => {
    setFlag(state, 'knowsCurse', true);
    if (choiceId === 'who-was-she') {
      setFlag(state, 'askedHarvestQueenHistory', true);
      bumpHeart(state, 'Milo', 1);
      return "'A goddess, maybe. A patron. Honestly nobody really knows. We just know things were good with her statue up.' Milo finally looks at Kyle. 'Laurel might know more. If she'll talk to you.'";
    }
    return "Milo nods, satisfied that Kyle just listened. 'Good. Most newcomers want to fix it in a day.'";
  },
};

const cliffhanger: Beat = {
  id: 'cliffhanger',
  title: 'Laurel at the Monastery',
  objective: "Answer Laurel's invitation at the monastery.",
  priority: 100,
  preconditions: (s) =>
    s.day >= 3 &&
    s.beatsCompleted.includes('curse-hint') &&
    s.location === 'mountain-monastery' &&
    !s.beatsCompleted.includes('cliffhanger'),
  openingBriefing: () =>
    "Laurel sits cross-legged at the monastery. She's been waiting. 'I heard you asked about her.' She regards Kyle for a long beat. 'I'm going to look for what's left of her. The statue, the broken pieces — and what broke them. I cannot do it alone. Your grandfather would have come with me.' Her eyes are steady. 'Will you?'",
  choices: () => [
    { id: 'yes', label: 'Yes. I will.' },
    { id: 'soon', label: 'I need a few more days first.' },
  ],
  resolve: (state, choiceId) => {
    if (choiceId === 'yes') {
      setFlag(state, 'partneredWithLaurel', true);
      bumpHeart(state, 'Laurel', 2);
      return "Laurel nods once. 'Then this is the end of your first chapter, Kyle Farmer. Get some sleep. The hard part begins tomorrow.' The screen fades to black. *DEMO ENDS*";
    }
    bumpHeart(state, 'Laurel', 1);
    return "Laurel inclines her head. 'I will wait. But not forever.' She returns to her meditation. The screen fades to black. *DEMO ENDS*";
  },
};

// =========================================================================
// Export
// =========================================================================

export const allBeats: Beat[] = [
  lawyersOffice,
  arrival,
  acceptTask,
  firstNight,
  morningChores,
  rescueElvira,
  townVisit,
  mushroomMistake,
  eveningAtInn,
  firstHarvest,
  curseHint,
  cliffhanger,
];
