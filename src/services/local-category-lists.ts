/**
 * Local curated category lists for the fallback suggestion strategy.
 * Used when AI-based suggestions fail or time out.
 */

/** Map of common categories to curated participant lists (at least 32 entries each). */
export const CATEGORY_LISTS: Record<string, string[]> = {
  movies: [
    'The Shawshank Redemption', 'The Godfather', 'The Dark Knight', 'Pulp Fiction',
    'Schindler\'s List', 'The Lord of the Rings: The Return of the King', 'Forrest Gump',
    'Inception', 'Fight Club', 'The Matrix', 'Goodfellas', 'Interstellar',
    'The Silence of the Lambs', 'Gladiator', 'The Green Mile', 'Parasite',
    'The Prestige', 'The Departed', 'Whiplash', 'Django Unchained',
    'The Lion King', 'Back to the Future', 'Alien', 'Jurassic Park',
    'Titanic', 'Avatar', 'Spirited Away', 'The Truman Show',
    'Braveheart', 'Saving Private Ryan', 'No Country for Old Men', 'Jaws',
    'Casablanca', 'The Wizard of Oz', 'Star Wars: A New Hope', 'Toy Story',
  ],
  'football players': [
    'Lionel Messi', 'Cristiano Ronaldo', 'Pelé', 'Diego Maradona',
    'Zinedine Zidane', 'Ronaldinho', 'Ronaldo Nazário', 'Johan Cruyff',
    'Michel Platini', 'Franz Beckenbauer', 'Alfredo Di Stéfano', 'George Best',
    'Thierry Henry', 'Marco van Basten', 'Gerd Müller', 'Bobby Charlton',
    'Paolo Maldini', 'Lev Yashin', 'Eusébio', 'Garrincha',
    'Kylian Mbappé', 'Neymar', 'Robert Lewandowski', 'Karim Benzema',
    'Andrés Iniesta', 'Xavi Hernández', 'Andrea Pirlo', 'Zlatan Ibrahimović',
    'Wayne Rooney', 'Romário', 'Rivaldo', 'Roberto Baggio',
    'David Beckham', 'Gheorghe Hagi', 'Ferenc Puskás', 'Erling Haaland',
  ],
  pasta: [
    'Spaghetti', 'Penne', 'Fusilli', 'Rigatoni',
    'Farfalle', 'Linguine', 'Tagliatelle', 'Fettuccine',
    'Orecchiette', 'Pappardelle', 'Bucatini', 'Conchiglie',
    'Rotini', 'Cavatappi', 'Gemelli', 'Orzo',
    'Macaroni', 'Cannelloni', 'Lasagna', 'Ravioli',
    'Tortellini', 'Gnocchi', 'Paccheri', 'Ziti',
    'Vermicelli', 'Angel Hair', 'Ditalini', 'Campanelle',
    'Strozzapreti', 'Trofie', 'Mafaldine', 'Casarecce',
    'Calamarata', 'Mezze Maniche', 'Lumache', 'Stelline',
  ],
  'video games': [
    'The Legend of Zelda: Breath of the Wild', 'The Witcher 3: Wild Hunt', 'Red Dead Redemption 2',
    'The Last of Us', 'God of War', 'Elden Ring', 'Super Mario Odyssey',
    'Minecraft', 'Grand Theft Auto V', 'Dark Souls', 'Halo: Combat Evolved',
    'Portal 2', 'Half-Life 2', 'Mass Effect 2', 'Bioshock',
    'Skyrim', 'Hollow Knight', 'Celeste', 'Undertale',
    'Chrono Trigger', 'Final Fantasy VII', 'Ocarina of Time', 'Super Metroid',
    'Metal Gear Solid', 'Resident Evil 4', 'Shadow of the Colossus', 'Persona 5',
    'Bloodborne', 'Sekiro: Shadows Die Twice', 'Disco Elysium', 'Baldur\'s Gate 3',
    'Tetris', 'Super Mario Bros.', 'Pac-Man', 'Doom',
  ],
  'music artists': [
    'The Beatles', 'Pink Floyd', 'Led Zeppelin', 'Queen',
    'Michael Jackson', 'David Bowie', 'Prince', 'Stevie Wonder',
    'Bob Dylan', 'Jimi Hendrix', 'Elvis Presley', 'Aretha Franklin',
    'Radiohead', 'Nirvana', 'The Rolling Stones', 'Fleetwood Mac',
    'Beyoncé', 'Kendrick Lamar', 'Taylor Swift', 'Kanye West',
    'Frank Ocean', 'Amy Winehouse', 'Adele', 'Billie Eilish',
    'Miles Davis', 'John Coltrane', 'Bob Marley', 'Johnny Cash',
    'Madonna', 'Whitney Houston', 'Elton John', 'Bruce Springsteen',
    'Arctic Monkeys', 'Daft Punk', 'Eminem', 'Jay-Z',
  ],
  countries: [
    'Japan', 'France', 'Italy', 'Brazil',
    'United States', 'Germany', 'United Kingdom', 'Australia',
    'Canada', 'Spain', 'Mexico', 'Argentina',
    'India', 'South Korea', 'Netherlands', 'Sweden',
    'Norway', 'Switzerland', 'Portugal', 'Greece',
    'Turkey', 'Thailand', 'Egypt', 'South Africa',
    'New Zealand', 'Ireland', 'Colombia', 'Chile',
    'Poland', 'Czech Republic', 'Austria', 'Belgium',
    'Denmark', 'Finland', 'Iceland', 'Croatia',
  ],
  cities: [
    'Tokyo', 'Paris', 'New York', 'London',
    'Rome', 'Barcelona', 'Sydney', 'Amsterdam',
    'Berlin', 'Prague', 'Vienna', 'Lisbon',
    'Buenos Aires', 'Rio de Janeiro', 'Istanbul', 'Bangkok',
    'Singapore', 'Dubai', 'Cape Town', 'Toronto',
    'San Francisco', 'Seoul', 'Melbourne', 'Copenhagen',
    'Dublin', 'Edinburgh', 'Kyoto', 'Florence',
    'Munich', 'Zurich', 'Oslo', 'Stockholm',
    'Marrakech', 'Havana', 'Mexico City', 'Vancouver',
  ],
  animals: [
    'Lion', 'Tiger', 'Elephant', 'Wolf',
    'Eagle', 'Dolphin', 'Whale', 'Shark',
    'Bear', 'Gorilla', 'Cheetah', 'Penguin',
    'Owl', 'Fox', 'Panther', 'Hawk',
    'Horse', 'Dog', 'Cat', 'Rabbit',
    'Octopus', 'Otter', 'Red Panda', 'Snow Leopard',
    'Falcon', 'Crocodile', 'Koala', 'Giraffe',
    'Chimpanzee', 'Deer', 'Cobra', 'Peacock',
    'Bison', 'Lynx', 'Jaguar', 'Raven',
  ],
  sports: [
    'Football', 'Basketball', 'Tennis', 'Cricket',
    'Baseball', 'Swimming', 'Athletics', 'Boxing',
    'Golf', 'Rugby', 'Volleyball', 'Ice Hockey',
    'Table Tennis', 'Badminton', 'Cycling', 'Gymnastics',
    'Wrestling', 'Fencing', 'Surfing', 'Skiing',
    'Skateboarding', 'MMA', 'Formula 1', 'Archery',
    'Rowing', 'Sailing', 'Diving', 'Handball',
    'Water Polo', 'Triathlon', 'Weightlifting', 'Judo',
    'Karate', 'Taekwondo', 'Rock Climbing', 'Snowboarding',
  ],
  foods: [
    'Pizza', 'Sushi', 'Tacos', 'Burger',
    'Pad Thai', 'Ramen', 'Croissant', 'Paella',
    'Dim Sum', 'Kebab', 'Fish and Chips', 'Pho',
    'Lasagna', 'Biryani', 'Ceviche', 'Peking Duck',
    'Falafel', 'Curry', 'Steak', 'Tiramisu',
    'Gelato', 'Churros', 'Baklava', 'Crème Brûlée',
    'Tom Yum', 'Gyoza', 'Empanadas', 'Moussaka',
    'Risotto', 'Bibimbap', 'Pulled Pork', 'Samosa',
    'Goulash', 'Poutine', 'Arepas', 'Shakshuka',
  ],
  songs: [
    'Bohemian Rhapsody - Queen', 'Imagine - John Lennon', 'Stairway to Heaven - Led Zeppelin',
    'Hotel California - Eagles', 'Smells Like Teen Spirit - Nirvana', 'Like a Rolling Stone - Bob Dylan',
    'Hey Jude - The Beatles', 'Billie Jean - Michael Jackson', 'What a Wonderful World - Louis Armstrong',
    'Respect - Aretha Franklin', 'Superstition - Stevie Wonder', 'Purple Rain - Prince',
    'One - U2', 'Thriller - Michael Jackson', 'Lose Yourself - Eminem',
    'Hallelujah - Leonard Cohen', 'No Woman No Cry - Bob Marley', 'Yesterday - The Beatles',
    'Sweet Child O\' Mine - Guns N\' Roses', 'Comfortably Numb - Pink Floyd',
    'Dancing Queen - ABBA', 'Don\'t Stop Believin\' - Journey', 'Nothing Else Matters - Metallica',
    'Wonderwall - Oasis', 'Creep - Radiohead', 'Africa - Toto',
    'Under Pressure - Queen & David Bowie', 'Take On Me - a-ha', 'Wish You Were Here - Pink Floyd',
    'Back in Black - AC/DC', 'November Rain - Guns N\' Roses', 'Mr. Brightside - The Killers',
    'Shape of You - Ed Sheeran', 'Blinding Lights - The Weeknd', 'Rolling in the Deep - Adele',
    'Despacito - Luis Fonsi', 'Seven Nation Army - The White Stripes', 'Uptown Funk - Bruno Mars',
  ],
  'pasta secca': [
    'Spaghetti', 'Penne', 'Fusilli', 'Rigatoni',
    'Farfalle', 'Linguine', 'Tagliatelle', 'Fettuccine',
    'Orecchiette', 'Pappardelle', 'Bucatini', 'Conchiglie',
    'Rotini', 'Cavatappi', 'Gemelli', 'Orzo',
    'Macaroni', 'Ziti', 'Vermicelli', 'Capelli d\'Angelo',
    'Ditalini', 'Campanelle', 'Strozzapreti', 'Trofie',
    'Mafaldine', 'Casarecce', 'Calamarata', 'Mezze Maniche',
    'Lumache', 'Stelline', 'Paccheri', 'Penne Lisce',
    'Sedani', 'Pipe Rigate', 'Tortiglioni', 'Bavette',
  ],
  'pasta ripiena': [
    'Ravioli', 'Tortellini', 'Cappelletti', 'Agnolotti',
    'Tortelloni', 'Pansotti', 'Casoncelli', 'Culurgiones',
    'Mezzelune', 'Schlutzkrapfen', 'Cappellacci', 'Anolini',
    'Cjarsons', 'Ofelle', 'Fagottini', 'Sacchettini',
    'Caramelle', 'Cannelloni Ripieni', 'Conchiglioni Ripieni', 'Lumaconi Ripieni',
    'Raviolini', 'Ravioloni', 'Tortelli', 'Marubini',
    'Plin', 'Tordelli', 'Scarpinocc', 'Panzerotti',
    'Triangoli', 'Girasoli', 'Cappelli del Prete', 'Bottoni',
  ],
  frutta: [
    'Mela', 'Banana', 'Arancia', 'Fragola',
    'Pesca', 'Ciliegia', 'Uva', 'Anguria',
    'Melone', 'Kiwi', 'Mango', 'Ananas',
    'Lampone', 'Mirtillo', 'Fico', 'Melograno',
    'Pera', 'Albicocca', 'Limone', 'Pompelmo',
    'Papaya', 'Cocco', 'Litchi', 'Maracuja',
    'Mandarino', 'Prugna', 'Nespola', 'Cachi',
    'Avocado', 'Mora', 'Ribes', 'Guava',
    'Carambola', 'Dragon Fruit', 'Kumquat', 'Tamarindo',
  ],
  'long drinks': [
    'Mojito', 'Long Island Iced Tea', 'Gin Tonic', 'Cuba Libre',
    'Tom Collins', 'Paloma', 'Dark \'n\' Stormy', 'Pimm\'s Cup',
    'Aperol Spritz', 'Hugo', 'Moscow Mule', 'Tequila Sunrise',
    'Singapore Sling', 'Mai Tai', 'Piña Colada', 'Sex on the Beach',
    'Blue Lagoon', 'Harvey Wallbanger', 'Screwdriver', 'John Collins',
    'Americano', 'Sbagliato', 'Campari Soda', 'Negroni Sbagliato',
    'Lynchburg Lemonade', 'Rum Punch', 'Planter\'s Punch', 'Zombie',
    'Caipirinha', 'Caipiroska', 'Horse\'s Neck', 'Gin Fizz',
    'French 75', 'Bellini', 'Rossini', 'Kir Royale',
  ],
};

/**
 * All known category keys for matching.
 */
const CATEGORY_KEYS = Object.keys(CATEGORY_LISTS);

/**
 * Fisher-Yates shuffle for arrays. Returns a new shuffled array.
 */
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Fuzzy-match a user-provided category against known list keys.
 * Performs case-insensitive partial matching.
 * Returns the matching key or undefined if no match found.
 */
export function matchCategory(category: string): string | undefined {
  const normalized = category.toLowerCase().trim();

  // Reject empty/whitespace-only input
  if (normalized.length === 0) {
    return undefined;
  }

  // Exact match first
  if (CATEGORY_LISTS[normalized]) {
    return normalized;
  }

  // Check if any known key is contained in the category or vice versa
  for (const key of CATEGORY_KEYS) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return key;
    }
  }

  // Check individual words in the category against keys
  const words = normalized.split(/\s+/);
  for (const word of words) {
    if (word.length < 3) continue; // skip short words
    for (const key of CATEGORY_KEYS) {
      if (key.includes(word) || word.includes(key)) {
        return key;
      }
    }
  }

  return undefined;
}

/**
 * Query local curated lists for suggestions matching a category.
 *
 * @param category - The tournament category to match against
 * @param existing - Names already in the bracket (to exclude from results)
 * @param count - Maximum number of suggestions to return
 * @returns Array of suggested names (may be fewer than count if not enough available)
 */
export function queryLocalLists(
  category: string,
  existing: string[],
  count: number
): string[] {
  const matchedKey = matchCategory(category);

  if (!matchedKey) {
    return [];
  }

  const list = CATEGORY_LISTS[matchedKey];
  const existingLower = new Set(existing.map(e => e.toLowerCase()));

  // Filter out any names already in the bracket
  const available = list.filter(
    item => !existingLower.has(item.toLowerCase())
  );

  // Shuffle and return up to count items
  const shuffled = shuffle(available);
  return shuffled.slice(0, count);
}
