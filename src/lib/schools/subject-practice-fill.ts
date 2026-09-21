import { minMathQuestionsForMinutes, padMathAnswerChoices } from "@/lib/schools/math-practice-fill";
import {
  canonicalShortLearningSubjectKey,
  type ShortLearningSubjectKey,
} from "@/lib/schools/short-learning-curriculum";

export type SubjectPracticeQuestion = {
  id: string;
  prompt: string;
  question: string;
  answer: string;
  choices: string[];
  options: string[];
  explanation: string;
  hints: string[];
  skillFocus: string;
  kind: "multiple-choice";
};

type Fact = {
  prompt: string;
  answer: string;
  extras: string[];
  explanation: string;
  skillFocus: string;
};

function yearNum(yearGroup: string | null | undefined): number {
  const match = /(\d{1,2})/.exec(yearGroup ?? "");
  const year = match ? Number(match[1]) : 4;
  return Number.isFinite(year) ? Math.min(11, Math.max(1, year)) : 4;
}

function band(year: number): "ks1" | "lks2" | "uks2" | "ks3" {
  if (year <= 2) return "ks1";
  if (year <= 4) return "lks2";
  if (year <= 6) return "uks2";
  return "ks3";
}

function toQuestion(fact: Fact, id: string): SubjectPracticeQuestion {
  const choices = padMathAnswerChoices({
    prompt: fact.prompt,
    answer: fact.answer,
    existing: fact.extras,
  });
  return {
    id,
    prompt: fact.prompt,
    question: fact.prompt,
    answer: fact.answer,
    choices,
    options: choices,
    explanation: fact.explanation,
    hints: [fact.explanation, "Use what you know about this subject, not a different one."],
    skillFocus: fact.skillFocus,
    kind: "multiple-choice",
  };
}

const BANK: Record<ShortLearningSubjectKey, Record<"ks1" | "lks2" | "uks2" | "ks3", Fact[]>> = {
  english: {
    ks1: [
      { prompt: "Which word is a noun?", answer: "dog", extras: ["run", "happy", "quickly"], explanation: "A noun names a person, place or thing. Dog is a thing.", skillFocus: "nouns" },
      { prompt: "Which sentence is a question?", answer: "Where is the cat?", extras: ["The cat is here.", "Sit down.", "What a cat!"], explanation: "Questions ask something and often start with who, what, where or how.", skillFocus: "sentences" },
      { prompt: "Which word rhymes with cat?", answer: "hat", extras: ["cup", "dog", "sun"], explanation: "Cat and hat both end with the at sound.", skillFocus: "phonics" },
      { prompt: "Who is the person a story is about?", answer: "the character", extras: ["the setting", "the illustrator", "the blurb"], explanation: "Characters are the people or animals in a story.", skillFocus: "story retrieval" },
    ],
    lks2: [
      { prompt: "Which sentence uses a fronted adverbial?", answer: "After lunch, we ran outside.", extras: ["We ran outside after lunch.", "We ran.", "Outside we."], explanation: "A fronted adverbial comes at the start, then a comma.", skillFocus: "fronted adverbials" },
      { prompt: "What is the setting of a story?", answer: "where and when it happens", extras: ["the main character's name", "the last sentence", "the author's age"], explanation: "Setting is time and place.", skillFocus: "comprehension" },
      { prompt: "Which word is an adjective?", answer: "ancient", extras: ["temple", "built", "quickly"], explanation: "Adjectives describe nouns. Ancient describes how old something is.", skillFocus: "grammar" },
      { prompt: "What does retrieve mean in reading?", answer: "find information in the text", extras: ["guess with no clues", "change the ending", "skip the paragraph"], explanation: "Retrieval is finding the answer in the words on the page.", skillFocus: "reading comprehension" },
    ],
    uks2: [
      { prompt: "Which sentence uses a relative clause?", answer: "The river, which flooded, burst its banks.", extras: ["The river flooded.", "Flooded the river.", "Banks burst river."], explanation: "Which flooded adds extra information about the river.", skillFocus: "relative clauses" },
      { prompt: "What is the main idea of a paragraph?", answer: "the most important point it makes", extras: ["the longest word", "the first capital letter", "a random detail"], explanation: "The main idea is what the paragraph is mostly about.", skillFocus: "summarising" },
      { prompt: "Which word is closest in meaning to rapid?", answer: "quick", extras: ["slow", "heavy", "quiet"], explanation: "Rapid means fast.", skillFocus: "vocabulary" },
      { prompt: "Why might an author use a short sentence?", answer: "to create impact or tension", extras: ["to hide the meaning", "because commas are banned", "to avoid full stops"], explanation: "Short sentences can slow the reader and add drama.", skillFocus: "author craft" },
    ],
    ks3: [
      { prompt: "What is a metaphor?", answer: "saying one thing is another to create an image", extras: ["a word that sounds like its meaning", "a list of three", "a question that needs no answer"], explanation: "A metaphor describes something as if it were something else.", skillFocus: "language analysis" },
      { prompt: "What is the writer's viewpoint?", answer: "the attitude they show towards the topic", extras: ["the page number", "the font size", "the printer used"], explanation: "Viewpoint is the writer's stance or opinion.", skillFocus: "viewpoints" },
    ],
  },
  maths: { ks1: [], lks2: [], uks2: [], ks3: [] },
  science: {
    ks1: [
      { prompt: "What do plants need to grow?", answer: "light, water and a place to grow", extras: ["only chocolate", "only noise", "only plastic"], explanation: "Plants need light, water and space.", skillFocus: "plants" },
      { prompt: "Which material is waterproof?", answer: "plastic", extras: ["tissue", "cotton wool", "cardboard"], explanation: "Plastic does not let water through easily.", skillFocus: "materials" },
      { prompt: "Which animal is a mammal?", answer: "cat", extras: ["goldfish", "robin", "frog"], explanation: "Mammals have fur or hair and usually drink milk when young.", skillFocus: "animals" },
      { prompt: "In winter in the UK, the days are usually…", answer: "shorter and colder", extras: ["longer and hotter", "exactly the same", "always snowy everywhere"], explanation: "Seasonal change means winter days are shorter and often colder.", skillFocus: "seasons" },
    ],
    lks2: [
      { prompt: "What do we need to complete an electrical circuit?", answer: "a complete loop from the battery", extras: ["only a bulb with no wires", "a magnet", "a wooden stick"], explanation: "Electricity flows when the circuit is a complete loop.", skillFocus: "electricity" },
      { prompt: "Sound is made when objects…", answer: "vibrate", extras: ["freeze", "rust", "evaporate"], explanation: "Vibrations travel to our ears as sound.", skillFocus: "sound" },
      { prompt: "Ice melting is a change from…", answer: "solid to liquid", extras: ["liquid to gas", "gas to solid", "liquid to solid"], explanation: "Melting turns a solid into a liquid.", skillFocus: "states of matter" },
      { prompt: "A shadow is formed when light is…", answer: "blocked by an opaque object", extras: ["turned into sound", "absorbed only by water", "reflected by a mirror into heat"], explanation: "Opaque objects block light and make shadows.", skillFocus: "light" },
    ],
    uks2: [
      { prompt: "The Earth orbits the…", answer: "Sun", extras: ["Moon", "Mars", "International Space Station"], explanation: "Earth takes one year to orbit the Sun.", skillFocus: "Earth and space" },
      { prompt: "Which organ pumps blood around the body?", answer: "the heart", extras: ["the liver", "the skin", "the stomach"], explanation: "The heart is a muscle that pumps blood.", skillFocus: "circulation" },
      { prompt: "Evolution is a change in living things over…", answer: "many generations", extras: ["one lunchtime", "one night", "one painting lesson"], explanation: "Characteristics can change across generations.", skillFocus: "evolution" },
      { prompt: "Which material is the best electrical conductor?", answer: "copper", extras: ["rubber", "wood", "plastic"], explanation: "Metals such as copper let electricity flow.", skillFocus: "properties of materials" },
    ],
    ks3: [
      { prompt: "Where is genetic information stored in a cell?", answer: "the nucleus", extras: ["the cell wall", "the vacuole only", "the cytoplasm only"], explanation: "The nucleus contains DNA.", skillFocus: "cells" },
      { prompt: "A force is measured in…", answer: "newtons", extras: ["litres", "degrees Celsius", "seconds"], explanation: "Force is measured in newtons (N).", skillFocus: "forces" },
    ],
  },
  computing: {
    ks1: [
      { prompt: "An algorithm is…", answer: "a clear set of instructions", extras: ["a type of battery", "a paint colour", "a musical instrument"], explanation: "Algorithms tell a computer or person what to do, in order.", skillFocus: "algorithms" },
      { prompt: "If a set of instructions goes wrong, we should…", answer: "debug them", extras: ["delete the whole school network", "ignore the error forever", "turn language into maths"], explanation: "Debugging means finding and fixing mistakes.", skillFocus: "debugging" },
      { prompt: "A safe password should be…", answer: "hard for other people to guess", extras: ["your first name only", "1234", "shared with everyone"], explanation: "Keep passwords private and not easy to guess.", skillFocus: "online safety" },
      { prompt: "A sequence is…", answer: "steps in a set order", extras: ["a random jumble", "a drawing of a river", "a times-table poster"], explanation: "Order matters in a sequence.", skillFocus: "sequences" },
    ],
    lks2: [
      { prompt: "What does a search engine do?", answer: "finds web pages that match key words", extras: ["cooks food", "prints books only", "charges a tablet"], explanation: "Search engines match your words to pages.", skillFocus: "using search" },
      { prompt: "Selection in a program means…", answer: "the program chooses a path using if/then", extras: ["the program never stops", "the computer paints a picture", "the user must shout"], explanation: "Selection uses conditions such as if this, then that.", skillFocus: "selection" },
      { prompt: "Personal information online should be…", answer: "kept private unless a trusted adult says otherwise", extras: ["posted on every site", "given to strangers in chat", "used as a game score"], explanation: "Protect name, school, address and photos.", skillFocus: "online safety" },
      { prompt: "Input is…", answer: "data going into a computer", extras: ["the finished printout only", "the plug socket", "the classroom clock"], explanation: "Keyboard, mouse and sensors are inputs.", skillFocus: "computer systems" },
    ],
    uks2: [
      { prompt: "A variable in a program stores…", answer: "a value that can change", extras: ["the school name carved in stone", "only pictures of rivers", "the teacher's birthday"], explanation: "Variables hold data the program can update.", skillFocus: "variables" },
      { prompt: "The internet is…", answer: "a network of connected networks", extras: ["one computer in a cupboard", "a single website", "a maths textbook"], explanation: "The internet links many networks together.", skillFocus: "networks" },
      { prompt: "Copyright means…", answer: "you need permission to reuse someone else's work", extras: ["anyone may copy anything", "only photos are free", "code cannot be owned"], explanation: "Respect other people's digital work.", skillFocus: "digital content" },
      { prompt: "A loop is used to…", answer: "repeat instructions", extras: ["delete a program", "turn sound into light", "draw a map of Rome"], explanation: "Loops stop you writing the same steps again and again.", skillFocus: "repetition" },
    ],
    ks3: [
      { prompt: "Binary is a number system that uses…", answer: "0 and 1", extras: ["only letters", "ten digits including 9", "Roman numerals"], explanation: "Computers store data as binary.", skillFocus: "data representation" },
      { prompt: "Phishing is…", answer: "a trick to steal personal information", extras: ["a type of loop", "a graphics card", "a healthy website"], explanation: "Do not click suspicious links or share passwords.", skillFocus: "cyber security" },
    ],
  },
  history: {
    ks1: [
      { prompt: "A toy from a long time ago might be made of…", answer: "wood", extras: ["only plastic from a shop today", "a games console", "a charging cable"], explanation: "Older toys were often wooden or metal, not plastic electronics.", skillFocus: "toys then and now" },
      { prompt: "How were many homes different 100 years ago?", answer: "they often had no electricity", extras: ["they all had Wi-Fi", "they all had dishwashers", "they were on the Moon"], explanation: "Life in the past had different technology.", skillFocus: "homes in the past" },
      { prompt: "A significant person is someone who…", answer: "made an important change or discovery", extras: ["is only famous for one afternoon", "never existed", "is a made-up times table"], explanation: "We study people who changed lives.", skillFocus: "significant people" },
      { prompt: "Then and now questions ask us to…", answer: "compare the past with today", extras: ["only count in 2s", "name the planets", "mix primary colours"], explanation: "History looks at what has changed and what has stayed the same.", skillFocus: "then and now" },
    ],
    lks2: [
      { prompt: "Who built many straight roads in Britain?", answer: "the Romans", extras: ["the Victorians only", "the Vikings only", "the Maya"], explanation: "Roman engineers built roads, towns and forts in Britain.", skillFocus: "the Romans in Britain" },
      { prompt: "Ancient Egyptians wrote using…", answer: "hieroglyphs", extras: ["binary code", "Morse code only", "emojis"], explanation: "Hieroglyphs were picture-symbols used in Ancient Egypt.", skillFocus: "Ancient Egypt" },
      { prompt: "The Stone Age is named after…", answer: "tools made from stone", extras: ["tools made from plastic", "the invention of cars", "the first tablets"], explanation: "People used stone tools before metal was common.", skillFocus: "Stone Age" },
      { prompt: "A primary source is…", answer: "evidence from the time being studied", extras: ["a modern textbook only", "a made-up story with no evidence", "a times-table square"], explanation: "Objects, letters and buildings from the time are primary sources.", skillFocus: "historical sources" },
    ],
    uks2: [
      { prompt: "Vikings came to Britain mainly from…", answer: "Scandinavia", extras: ["Australia", "the Amazon rainforest", "Antarctica"], explanation: "Viking raiders and settlers came from Norway, Denmark and Sweden.", skillFocus: "Anglo-Saxons and Vikings" },
      { prompt: "The ancient Olympic Games began in…", answer: "Greece", extras: ["Rome only", "Egypt only", "Britain only"], explanation: "The Olympics started in Ancient Greece.", skillFocus: "Ancient Greece" },
      { prompt: "During the Blitz in World War II, many children were…", answer: "evacuated from cities", extras: ["sent to live on Mars", "taught only swimming", "asked to build pyramids"], explanation: "Evacuation moved children away from bombing.", skillFocus: "World War II" },
      { prompt: "The Maya civilisation is known for…", answer: "cities, writing and a calendar in Mesoamerica", extras: ["inventing the steam engine in Britain", "building the first motorways", "writing Shakespeare's plays"], explanation: "Maya people built cities and developed writing in Central America.", skillFocus: "the Maya" },
    ],
    ks3: [
      { prompt: "1066 is remembered for…", answer: "the Norman Conquest", extras: ["the first Moon landing", "the invention of the World Wide Web", "the first FA Cup final"], explanation: "William of Normandy won the Battle of Hastings in 1066.", skillFocus: "medieval life" },
      { prompt: "Henry VIII is most associated with…", answer: "breaking from the Roman Catholic Church", extras: ["flying the first aeroplane", "discovering penicillin", "building the Channel Tunnel"], explanation: "Henry VIII's break with Rome changed religion in England.", skillFocus: "Tudors" },
    ],
  },
  geography: {
    ks1: [
      { prompt: "How many countries make up the United Kingdom?", answer: "four", extras: ["two", "ten", "fifty"], explanation: "England, Scotland, Wales and Northern Ireland.", skillFocus: "the UK countries" },
      { prompt: "A globe is useful because it…", answer: "shows the Earth as a sphere", extras: ["tells the time in only one town", "measures rainfall in a cup", "stores times tables"], explanation: "Globes model the shape of the Earth.", skillFocus: "maps and globes" },
      { prompt: "The weather is…", answer: "the conditions outside day to day", extras: ["the same as climate over 30 years", "a type of rock", "a Roman road"], explanation: "Weather changes from day to day.", skillFocus: "weather" },
      { prompt: "The North Pole is a…", answer: "cold place", extras: ["hot desert", "tropical rainforest", "coral reef"], explanation: "Polar regions are very cold.", skillFocus: "hot and cold places" },
    ],
    lks2: [
      { prompt: "The start of a river is called the…", answer: "source", extras: ["mouth", "delta only", "estuary only"], explanation: "Rivers flow from source to mouth.", skillFocus: "rivers" },
      { prompt: "A volcano is…", answer: "an opening where magma can reach the surface", extras: ["a type of cloud", "a Roman villa", "a times-table grid"], explanation: "Volcanoes form where magma rises.", skillFocus: "volcanoes and earthquakes" },
      { prompt: "A settlement is…", answer: "a place where people live", extras: ["a type of mineral", "a computer program", "a music note"], explanation: "Hamlets, villages, towns and cities are settlements.", skillFocus: "settlements" },
      { prompt: "Europe is…", answer: "a continent", extras: ["a single city", "a river in Egypt", "a planet"], explanation: "Europe is one of the world's continents.", skillFocus: "Europe" },
    ],
    uks2: [
      { prompt: "A biome is…", answer: "a large area with similar climate, plants and animals", extras: ["a single tree", "a classroom rule", "a fraction"], explanation: "Rainforests and deserts are biomes.", skillFocus: "biomes" },
      { prompt: "Climate is…", answer: "the average weather over a long time", extras: ["today's rainfall only", "a mountain's height", "a king's name"], explanation: "Climate describes long-term patterns.", skillFocus: "climate" },
      { prompt: "Four-figure grid references on OS maps help you…", answer: "find a square on the map", extras: ["cook a meal", "measure a heartbeat", "spell a homophone"], explanation: "Eastings then northings locate a grid square.", skillFocus: "OS maps" },
      { prompt: "Trade is…", answer: "buying and selling goods and services", extras: ["only exploring caves", "painting a still life", "counting in Roman numerals"], explanation: "Countries import and export through trade.", skillFocus: "trade" },
    ],
    ks3: [
      { prompt: "Earthquakes are most common near…", answer: "plate boundaries", extras: ["the middle of every classroom", "the Moon's silent side", "the Earth's inner core shops"], explanation: "Tectonic plates meet at boundaries.", skillFocus: "tectonics" },
      { prompt: "Urbanisation means…", answer: "a growing share of people living in towns and cities", extras: ["forests taking over cities", "rivers flowing backwards", "maps becoming globes"], explanation: "People move to urban areas for work and services.", skillFocus: "urbanisation" },
    ],
  },
  "religious-education": {
    ks1: [
      { prompt: "A festival is…", answer: "a special time of celebration", extras: ["a type of river", "a times table", "a computer bug"], explanation: "Festivals mark important events in religions and communities.", skillFocus: "festivals" },
      { prompt: "A church is a place of worship in…", answer: "Christianity", extras: ["only computing lessons", "athletics", "map reading"], explanation: "Christians often worship in a church.", skillFocus: "places of worship" },
      { prompt: "The Torah is a special book in…", answer: "Judaism", extras: ["PE tactics", "fractions", "volcanoes"], explanation: "The Torah is sacred in Judaism.", skillFocus: "special books" },
      { prompt: "Caring for others is an example of…", answer: "a value shared by many religions", extras: ["a type of magnet", "a grid reference", "a fronted adverbial"], explanation: "Kindness is taught in many worldviews.", skillFocus: "caring for others" },
    ],
    lks2: [
      { prompt: "Ramadan is a month of fasting in…", answer: "Islam", extras: ["athletics season only", "the Stone Age", "binary code"], explanation: "Many Muslims fast from dawn to sunset in Ramadan.", skillFocus: "Islam" },
      { prompt: "Diwali is widely celebrated in…", answer: "Hinduism", extras: ["only river fieldwork", "only coding clubs", "only Roman Britain"], explanation: "Diwali is a festival of lights for many Hindus.", skillFocus: "Hinduism" },
      { prompt: "A synagogue is a place of worship in…", answer: "Judaism", extras: ["swimming lessons", "pottery class", "times tables"], explanation: "Jewish communities gather in a synagogue.", skillFocus: "Judaism" },
      { prompt: "The Bible is a holy book in…", answer: "Christianity", extras: ["music notation only", "OS maps only", "debugging only"], explanation: "Christians read the Bible as scripture.", skillFocus: "Christianity" },
    ],
    uks2: [
      { prompt: "The Five Pillars are central practices in…", answer: "Islam", extras: ["athletics officiating", "spreadsheet formulas", "watercolours"], explanation: "The Five Pillars guide Muslim practice.", skillFocus: "Islam" },
      { prompt: "The Guru Granth Sahib is the sacred scripture of…", answer: "Sikhism", extras: ["the Romans", "the Maya calendar only", "KS2 SATs maths"], explanation: "Sikhs honour the Guru Granth Sahib in the gurdwara.", skillFocus: "Sikhism" },
      { prompt: "Meditation is an important practice in…", answer: "Buddhism", extras: ["only long jump", "only pie charts", "only soldering"], explanation: "Buddhists may meditate to develop calm and insight.", skillFocus: "Buddhism" },
      { prompt: "A worldview is…", answer: "the way a person understands life and meaning", extras: ["a type of biome", "a keyboard shortcut", "a fraction wall"], explanation: "Religious and non-religious worldviews shape values.", skillFocus: "beliefs and values" },
    ],
    ks3: [
      { prompt: "Ethics is the study of…", answer: "right and wrong", extras: ["only river meanders", "only binary", "only pulse in music"], explanation: "Ethics asks how we should live.", skillFocus: "ethics" },
      { prompt: "A parable is…", answer: "a story told to teach a moral or spiritual lesson", extras: ["a volcanic eruption", "a computer virus", "a 3D print file"], explanation: "Jesus used parables in the Gospels.", skillFocus: "sacred texts" },
    ],
  },
  "modern-foreign-languages": {
    ks1: [
      { prompt: "Bonjour means…", answer: "hello", extras: ["goodbye", "thank you", "please"], explanation: "Bonjour is a French greeting.", skillFocus: "greetings" },
      { prompt: "Rouge is a French word for a…", answer: "colour (red)", extras: ["number", "day of the week", "sport"], explanation: "Rouge means red.", skillFocus: "colours" },
      { prompt: "Un, deux, trois are…", answer: "numbers", extras: ["colours", "animals", "months"], explanation: "They are French numbers 1, 2, 3.", skillFocus: "numbers" },
      { prompt: "Merci means…", answer: "thank you", extras: ["see you later", "my name is", "how old are you"], explanation: "Merci is how you say thank you in French.", skillFocus: "classroom words" },
    ],
    lks2: [
      { prompt: "Comment tu t'appelles? asks…", answer: "what is your name?", extras: ["how old are you?", "where is the library?", "what time is it?"], explanation: "It is a name question in French.", skillFocus: "introductions" },
      { prompt: "La famille means…", answer: "the family", extras: ["the school", "the weather", "the food"], explanation: "Famille is family.", skillFocus: "family" },
      { prompt: "J'aime means…", answer: "I like", extras: ["I am", "I have", "I go"], explanation: "J'aime expresses a like.", skillFocus: "opinions" },
      { prompt: "Pain is a French word for…", answer: "bread", extras: ["apple", "water", "cheese"], explanation: "Le pain is bread.", skillFocus: "food" },
    ],
    uks2: [
      { prompt: "Lundi is…", answer: "Monday", extras: ["Sunday", "July", "winter"], explanation: "Days of the week: lundi is Monday.", skillFocus: "days and months" },
      { prompt: "J'habite à… means…", answer: "I live in…", extras: ["I eat…", "I play…", "I am called…"], explanation: "Habiter means to live.", skillFocus: "simple sentences" },
      { prompt: "Les maths is a…", answer: "school subject", extras: ["colour", "pet", "month"], explanation: "School subjects include les maths.", skillFocus: "school subjects" },
      { prompt: "A cognate is a word that…", answer: "looks similar in English and the other language", extras: ["has no meaning", "is only used in PE", "is a type of fraction"], explanation: "Animal and animal are cognates.", skillFocus: "vocabulary" },
    ],
    ks3: [
      { prompt: "The present tense describes…", answer: "what happens now or usually", extras: ["only the distant past", "only the future", "only commands"], explanation: "Present tense is used for current or habitual actions.", skillFocus: "present tense" },
      { prompt: "An opinion phrase in French is…", answer: "je pense que", extras: ["il y avait", "nous irons", "fermez la porte only"], explanation: "Je pense que means I think that.", skillFocus: "opinions" },
    ],
  },
  "art-and-design": {
    ks1: [
      { prompt: "Red and yellow mix to make…", answer: "orange", extras: ["green", "purple", "brown only"], explanation: "Red and yellow are primary colours that make orange.", skillFocus: "colour mixing" },
      { prompt: "A pencil drawing from looking at a real object is…", answer: "observational drawing", extras: ["a times table", "a river source", "a binary number"], explanation: "You draw what you can see.", skillFocus: "drawing from observation" },
      { prompt: "Texture in art means…", answer: "how a surface feels or looks like it feels", extras: ["the title of a map", "a verb tense", "a computer loop"], explanation: "Rough, smooth and bumpy are textures.", skillFocus: "texture" },
      { prompt: "Primary colours are…", answer: "red, yellow and blue", extras: ["green, orange and purple", "black, white and grey", "gold, silver and bronze"], explanation: "Other colours are mixed from primaries.", skillFocus: "colour" },
    ],
    lks2: [
      { prompt: "Tone is…", answer: "how light or dark a colour or pencil mark is", extras: ["the name of a river", "a type of algorithm", "a Roman emperor"], explanation: "Shading creates tone.", skillFocus: "tone and shading" },
      { prompt: "A sculpture is…", answer: "a 3D artwork", extras: ["only a printed worksheet", "a 2D timetable", "a spelling list"], explanation: "Sculpture has height, width and depth.", skillFocus: "sculpture" },
      { prompt: "Printing in art often uses…", answer: "a block or stamp to repeat a mark", extras: ["only a calculator", "only a stopwatch", "only a compass rose"], explanation: "Ink transfers from a block to paper.", skillFocus: "printing" },
      { prompt: "An artist study looks at…", answer: "how an artist works and what we can learn", extras: ["only a lunch menu", "only a bus timetable", "only a scoresheet"], explanation: "We copy techniques and ideas, not just the name.", skillFocus: "artists" },
    ],
    uks2: [
      { prompt: "Perspective helps a drawing look…", answer: "three-dimensional and receding in space", extras: ["louder", "faster to run", "better at fractions"], explanation: "Lines can meet at a vanishing point.", skillFocus: "perspective" },
      { prompt: "Mixed media means…", answer: "using more than one material in one artwork", extras: ["using only a 2B pencil forever", "only digital typing", "only clay with no colour"], explanation: "Paint, collage and pencil can be combined.", skillFocus: "mixed media" },
      { prompt: "A design brief tells you…", answer: "the purpose and audience for a piece", extras: ["the answer to 8 × 7", "the capital of France only", "a river's discharge"], explanation: "Art and design can solve a problem for a user.", skillFocus: "design for a purpose" },
      { prompt: "An art movement is…", answer: "a shared style in a period of time", extras: ["a PE warm-up", "a tectonic plate", "a search engine"], explanation: "Impressionism is an example of a movement.", skillFocus: "art movements" },
    ],
    ks3: [
      { prompt: "The formal elements include…", answer: "line, tone, colour, texture, shape and form", extras: ["only nouns and verbs", "only latitude and longitude", "only pulse and tempo"], explanation: "Formal elements are the building blocks of art.", skillFocus: "formal elements" },
      { prompt: "Annotation in a sketchbook should…", answer: "explain your choices and next steps", extras: ["only copy the date", "only list friends' names", "only draw a smiley face"], explanation: "Write why you did something, not just what.", skillFocus: "annotation" },
    ],
  },
  "design-and-technology": {
    ks1: [
      { prompt: "A wheel and axle help a vehicle…", answer: "roll", extras: ["float only", "photosynthesise", "translate French"], explanation: "Wheels turn around an axle.", skillFocus: "wheels and axles" },
      { prompt: "A healthy lunch should include…", answer: "a range of foods, not only sweets", extras: ["only chocolate", "only fizzy drinks", "only crisps"], explanation: "A balanced diet uses different food groups.", skillFocus: "healthy food" },
      { prompt: "When we evaluate a product we…", answer: "say what works and what to improve", extras: ["hide it forever", "only count to 10", "only paint it gold"], explanation: "Designers test and improve.", skillFocus: "design and make" },
      { prompt: "Glue, tape and split pins are used for…", answer: "joining materials", extras: ["measuring wind speed", "coding a loop", "naming Roman gods"], explanation: "Different joins suit different materials.", skillFocus: "joining materials" },
    ],
    lks2: [
      { prompt: "A lever is a…", answer: "simple mechanism that turns around a pivot", extras: ["type of cloud", "French greeting", "musical scale"], explanation: "See-saws are levers.", skillFocus: "levers and linkages" },
      { prompt: "A shell structure gets strength from…", answer: "its shape, like a box or egg", extras: ["being completely flat", "being made of mist", "being a fraction"], explanation: "Nets fold into strong 3D shells.", skillFocus: "shell structures" },
      { prompt: "A design specification lists…", answer: "what the product must do", extras: ["the class register", "the weather in Peru", "the 9 times table"], explanation: "It is the checklist for success.", skillFocus: "evaluating products" },
      { prompt: "Hygiene when preparing food means…", answer: "washing hands and keeping surfaces clean", extras: ["running the fastest", "debugging code", "drawing vanishing points"], explanation: "Clean hands reduce germs.", skillFocus: "healthy sandwiches" },
    ],
    uks2: [
      { prompt: "A series circuit for a product needs…", answer: "a complete path for electricity", extras: ["only a wooden spoon", "only a river meander", "only a metaphor"], explanation: "Gaps stop the component working.", skillFocus: "electrical systems" },
      { prompt: "Seasonality in food means…", answer: "some foods are grown at certain times of year", extras: ["all food is grown on the Moon", "vegetables never grow", "only sweets are seasonal"], explanation: "UK strawberries are typically summer fruit.", skillFocus: "food seasonality" },
      { prompt: "A frame structure is made from…", answer: "beams joined to make a skeleton", extras: ["only steam", "only sound waves", "only adjectives"], explanation: "Towers and tents use frames.", skillFocus: "frame structures" },
      { prompt: "User-centred design starts with…", answer: "the needs of the person who will use it", extras: ["the designer's favourite colour only", "a random material", "copying a times-table grid"], explanation: "Research the user first.", skillFocus: "user-centred design" },
    ],
    ks3: [
      { prompt: "Iterative design means…", answer: "testing and improving in cycles", extras: ["making one version and never changing it", "only drawing in biro", "skipping research"], explanation: "Prototype, test, refine.", skillFocus: "iterative design" },
      { prompt: "A hardwood comes from…", answer: "broadleaved trees that often grow slowly", extras: ["only recycled plastic", "only granite", "only cotton"], explanation: "Oak is a hardwood.", skillFocus: "materials" },
    ],
  },
  music: {
    ks1: [
      { prompt: "Pulse in music is…", answer: "the steady beat", extras: ["the volume of a volcano", "a type of fraction", "a search result"], explanation: "Clap along with the pulse.", skillFocus: "pulse and rhythm" },
      { prompt: "Forte means…", answer: "loud", extras: ["quiet", "slow", "high pitched"], explanation: "Italian terms: forte is loud.", skillFocus: "loud and quiet" },
      { prompt: "A percussion instrument is played by…", answer: "hitting, shaking or scraping", extras: ["only plugging it into Wi-Fi", "only reading a map", "only multiplying"], explanation: "Drums and shakers are percussion.", skillFocus: "classroom instruments" },
      { prompt: "Pitch is…", answer: "how high or low a sound is", extras: ["how long a river is", "how fast you sprint", "how old a fossil is"], explanation: "A whistle can be high pitch.", skillFocus: "singing" },
    ],
    lks2: [
      { prompt: "An ostinato is…", answer: "a repeated musical pattern", extras: ["a one-off crash", "a silent rest forever", "a painted still life"], explanation: "Ostinatos loop under a melody.", skillFocus: "ostinato" },
      { prompt: "A crotchet is worth…", answer: "one beat", extras: ["four beats", "half a beat", "no beats"], explanation: "In 4/4 time a crotchet is one beat.", skillFocus: "notation" },
      { prompt: "Tempo is…", answer: "the speed of the music", extras: ["the colour of the stage", "the name of a biome", "the size of a lever"], explanation: "Allegro is a fast tempo.", skillFocus: "pitch" },
      { prompt: "Composing means…", answer: "creating your own music", extras: ["only copying a maths method", "only tracing a map", "only stretching in PE"], explanation: "You invent rhythm or melody.", skillFocus: "composing a pattern" },
    ],
    uks2: [
      { prompt: "Harmony is…", answer: "two or more notes sounding together", extras: ["a solo rest", "a single drum hit always alone", "a spoken sentence"], explanation: "Chords create harmony.", skillFocus: "harmony" },
      { prompt: "Structure in a song might be…", answer: "verse and chorus", extras: ["source and mouth", "input and output only", "noun and adjective only"], explanation: "Sections organise the music.", skillFocus: "structure" },
      { prompt: "A genre is…", answer: "a style of music", extras: ["a type of rock layer", "a Roman road", "a spreadsheet"], explanation: "Jazz, folk and pop are genres.", skillFocus: "listening to genres" },
      { prompt: "A melody is…", answer: "a tune made of pitched notes", extras: ["only the drum pulse", "only the lyrics without notes", "a grid reference"], explanation: "Melody is the part you can hum.", skillFocus: "melody" },
    ],
    ks3: [
      { prompt: "An ensemble is…", answer: "a group of musicians playing together", extras: ["a solo always", "a silent rehearsal only", "a geography fieldwork pair"], explanation: "Choirs and bands are ensembles.", skillFocus: "ensemble" },
      { prompt: "Appraising music means…", answer: "listening and describing how it is put together", extras: ["only performing louder", "only rewriting the lyrics as fractions", "only drawing the speaker"], explanation: "Use musical vocabulary to explain what you hear.", skillFocus: "appraising" },
    ],
  },
  "physical-education": {
    ks1: [
      { prompt: "A warm-up helps your body by…", answer: "raising heart rate and preparing muscles", extras: ["replacing dinner", "teaching hieroglyphs", "debugging a program"], explanation: "Start slowly so you are ready to move.", skillFocus: "healthy bodies" },
      { prompt: "In a simple game, fair play means…", answer: "following the rules and being kind", extras: ["winning by cheating", "ignoring teammates", "leaving the ball every time"], explanation: "Respect the rules and each other.", skillFocus: "teamwork" },
      { prompt: "Balance is…", answer: "keeping your body steady", extras: ["throwing as far as possible only", "running the longest distance only", "shouting the loudest"], explanation: "Hold a still shape on one foot or two.", skillFocus: "moving with control" },
      { prompt: "Your heart beats faster when you…", answer: "exercise", extras: ["sleep deeply without moving", "sit completely still for an hour", "only read quietly"], explanation: "Muscles need more oxygen during exercise.", skillFocus: "healthy bodies" },
    ],
    lks2: [
      { prompt: "In invasion games the attacking team tries to…", answer: "score in the opponents' area", extras: ["stay in their own half forever", "only practise scales", "only draw a map"], explanation: "Football, netball and tag rugby are invasion games.", skillFocus: "invasion games" },
      { prompt: "A sequence in gymnastics is…", answer: "a series of linked movements", extras: ["a single frozen pose only", "a times-table chant", "a river meander"], explanation: "Link rolls, jumps and balances.", skillFocus: "gymnastics" },
      { prompt: "In athletics, a sprint is…", answer: "a short, fast run", extras: ["a long throw", "a high jump only", "a swimming length"], explanation: "Sprints are anaerobic, short bursts.", skillFocus: "athletics" },
      { prompt: "Passing into space helps because…", answer: "a teammate can move onto the ball", extras: ["the other team always gets it", "the ball disappears", "rules ban movement"], explanation: "Look up and pass where a teammate is going.", skillFocus: "invasion games" },
    ],
    uks2: [
      { prompt: "A tactic is…", answer: "a planned way to outwit opponents", extras: ["a type of mineral", "a French verb", "a brush technique"], explanation: "Tactics might include spreading out or pressing.", skillFocus: "tactics" },
      { prompt: "Striking and fielding games include…", answer: "rounders and cricket", extras: ["only chess", "only swimming starts", "only 100 m hurdles"], explanation: "One team bats, the other fields.", skillFocus: "striking and fielding" },
      { prompt: "Cardiovascular fitness is the ability to…", answer: "keep exercising with the heart and lungs working well", extras: ["lift the heaviest weight once", "stretch the furthest once", "sit still the longest"], explanation: "Running and swimming build this.", skillFocus: "fitness" },
      { prompt: "A good leader in PE will…", answer: "encourage others and communicate clearly", extras: ["blame teammates for everything", "ignore safety", "hide the equipment"], explanation: "Leadership is about the team, not just skill.", skillFocus: "leadership" },
    ],
    ks3: [
      { prompt: "The hamstrings are mainly found at the…", answer: "back of the thigh", extras: ["palms of the hands", "tips of the ears", "soles of the feet only"], explanation: "Hamstrings bend the knee.", skillFocus: "anatomy" },
      { prompt: "A cool-down helps to…", answer: "gradually lower heart rate after exercise", extras: ["replace a warm-up at the start", "teach punctuation", "increase sprint speed instantly"], explanation: "Jog then stretch after sport.", skillFocus: "training" },
    ],
  },
  citizenship: {
    ks1: [
      { prompt: "School rules exist to…", answer: "keep people safe and treat others fairly", extras: ["make lessons shorter", "stop you learning", "replace playtime with tests"], explanation: "Rules help a community work.", skillFocus: "rules and fairness" },
      { prompt: "If someone is left out, a kind action is to…", answer: "invite them to join in", extras: ["laugh and walk away", "hide their bag", "tell them to sit alone"], explanation: "Including others is part of a caring community.", skillFocus: "helping others" },
      { prompt: "A community is…", answer: "a group of people who live or work together", extras: ["a type of triangle", "a computer chip", "a treble clef"], explanation: "Family, school and local area are communities.", skillFocus: "my community" },
      { prompt: "Telling a trusted adult is important when…", answer: "you or someone else is unsafe or upset", extras: ["you finish a drawing", "you like a colour", "you can count to 5"], explanation: "Adults can help with big worries.", skillFocus: "feelings" },
    ],
    lks2: [
      { prompt: "A right is something you…", answer: "are entitled to, such as being safe and heard", extras: ["must buy with pocket money", "only get if you win a race", "lose if you like art"], explanation: "Children have rights, and also responsibilities.", skillFocus: "rights and responsibilities" },
      { prompt: "A school council is an example of…", answer: "democracy in school", extras: ["a river delta", "a percussion family", "a search algorithm"], explanation: "Pupils vote and have a voice.", skillFocus: "democracy in school" },
      { prompt: "Respecting difference means…", answer: "valuing people even when they are not the same as you", extras: ["making everyone identical", "ignoring other cultures", "only playing with one friend forever"], explanation: "Diversity is part of community life.", skillFocus: "respecting difference" },
      { prompt: "Money we save is…", answer: "kept for later instead of spent now", extras: ["thrown away", "always a tax", "only for adults in banks on the Moon"], explanation: "Saving is a money skill.", skillFocus: "money basics" },
    ],
    uks2: [
      { prompt: "Parliament in the UK is where…", answer: "laws are debated and made", extras: ["only weather is forecast", "only football is played", "only paintings are sold"], explanation: "MPs represent constituencies in Parliament.", skillFocus: "Parliament" },
      { prompt: "A law is…", answer: "a rule of the country that everyone must follow", extras: ["a school club suggestion", "a music genre", "a type of lever"], explanation: "Laws are enforced and protect rights.", skillFocus: "laws" },
      { prompt: "Reliable information is more likely to come from…", answer: "checked facts from trusted sources", extras: ["an anonymous rumour with no evidence", "a joke that sounds exciting", "anything in capital letters"], explanation: "Ask who wrote it and whether it can be checked.", skillFocus: "media and information" },
      { prompt: "Community action is…", answer: "people working together to improve something local", extras: ["waiting for a problem to vanish", "only posting a complaint and stopping", "ignoring neighbours"], explanation: "Litter picks and fundraising are examples.", skillFocus: "community action" },
    ],
    ks3: [
      { prompt: "The judiciary is the part of the state that…", answer: "interprets and applies the law in courts", extras: ["writes pop songs", "forecasts rainfall", "designs school logos"], explanation: "Courts are separate from Parliament.", skillFocus: "justice" },
      { prompt: "Active citizenship includes…", answer: "voting, volunteering and campaigning peacefully", extras: ["breaking the law to be noticed", "never joining anything", "only playing games online"], explanation: "You can participate legally and respectfully.", skillFocus: "active citizenship" },
    ],
  },
};

export function looksLikeMathsDrillPrompt(prompt: string): boolean {
  return /array has \d+ rows|what is \d+\s*[×x*+÷\-]\s*\d+|times table|number bond|\d+\s*[×x]\s*\d+\s*trays|how many altogether/i.test(prompt);
}

export function buildSubjectPracticeFillItems(input: {
  subject?: string | null;
  yearGroup?: string | null;
  skillFocus?: string | null;
  existingPrompts?: string[];
  count: number;
  idPrefix?: string;
}): SubjectPracticeQuestion[] {
  const key = canonicalShortLearningSubjectKey(input.subject);
  if (!key || key === "maths") return [];
  const year = yearNum(input.yearGroup);
  const facts = BANK[key][band(year)];
  if (!facts.length) return [];
  const start = (year - 1) % facts.length;
  const used = new Set((input.existingPrompts ?? []).map((prompt) => prompt.trim().toLowerCase()));
  const items: SubjectPracticeQuestion[] = [];
  let cursor = 0;
  while (items.length < input.count && cursor < facts.length * 3) {
    const fact = facts[(start + cursor) % facts.length];
    if (!fact) break;
    const prompt = cursor < facts.length ? fact.prompt : `${fact.prompt} (check the subject carefully.)`;
    cursor += 1;
    const keyPrompt = prompt.trim().toLowerCase();
    if (used.has(keyPrompt)) continue;
    used.add(keyPrompt);
    items.push(
      toQuestion(
        {
          ...fact,
          prompt,
          skillFocus: input.skillFocus?.trim() || fact.skillFocus,
        },
        `${input.idPrefix ?? `${key}-fill`}-${items.length + 1}`,
      ),
    );
  }
  return items;
}

export function ensureMinimumSubjectQuestions<T extends Record<string, unknown>>(input: {
  questions: T[];
  subject?: string | null;
  yearGroup?: string | null;
  skillFocus?: string | null;
  title?: string | null;
  estimatedMinutes?: number | null;
}): T[] {
  const key = canonicalShortLearningSubjectKey(input.subject);
  if (!key || key === "maths") return input.questions;
  const minCount = minMathQuestionsForMinutes(input.estimatedMinutes, input.title);
  if (input.questions.length >= minCount) return input.questions;
  const extras = buildSubjectPracticeFillItems({
    subject: key,
    yearGroup: input.yearGroup,
    skillFocus: input.skillFocus,
    existingPrompts: input.questions.map((row) => String(row.prompt ?? row.question ?? "")),
    count: minCount - input.questions.length,
  });
  return [...input.questions, ...(extras as unknown as T[])];
}

export function replaceOffSubjectMathsQuestions<T extends Record<string, unknown>>(input: {
  questions: T[];
  subject?: string | null;
  yearGroup?: string | null;
  skillFocus?: string | null;
  estimatedMinutes?: number | null;
  title?: string | null;
}): T[] {
  const key = canonicalShortLearningSubjectKey(input.subject);
  if (!key || key === "maths") return input.questions;
  const mathsLike = input.questions.filter((row) =>
    looksLikeMathsDrillPrompt(String(row.prompt ?? row.question ?? "")),
  );
  const mostlyMaths = input.questions.length === 0
    || mathsLike.length >= Math.max(1, Math.ceil(input.questions.length / 2));
  if (!mostlyMaths) return input.questions;
  const replacements = buildSubjectPracticeFillItems({
    subject: key,
    yearGroup: input.yearGroup,
    skillFocus: input.skillFocus,
    count: minMathQuestionsForMinutes(input.estimatedMinutes, input.title),
  });
  return replacements as unknown as T[];
}
