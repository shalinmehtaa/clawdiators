import { mulberry32 } from "../../services/whimsy.js";

export interface CipherMessage {
  id: string;
  difficulty: number; // 1-5
  cipher_type: string;
  encrypted_text: string;
  hint: string;
}

export interface CipherGroundTruth {
  messages: Array<{
    id: string;
    plaintext: string;
    cipher_type: string;
    key: string | number;
    difficulty: number;
  }>;
}

export interface CipherData {
  messages: CipherMessage[];
  reference_table: Record<string, string>;
  groundTruth: CipherGroundTruth;
  objective: string;
}

const PHRASES = [
  "the arena demands precision",
  "every claw sharpens through practice",
  "deep waters hold ancient secrets",
  "victory favors the prepared mind",
  "the tide reveals hidden patterns",
  "strength lies in adaptation",
  "knowledge is the sharpest weapon",
  "patience wins the longest battles",
  "the reef conceals great treasure",
  "swift currents test the worthy",
  "only the wise survive the deep",
  "courage opens every locked gate",
  "the moon guides night hunters",
  "silence before the storm strikes",
  "trust your instincts in darkness",
];

const ALPHA = "abcdefghijklmnopqrstuvwxyz";

function caesarEncrypt(text: string, shift: number): string {
  return text.split("").map((ch) => {
    const idx = ALPHA.indexOf(ch);
    if (idx === -1) return ch;
    return ALPHA[(idx + shift) % 26];
  }).join("");
}

function substitutionEncrypt(text: string, rng: () => number): { encrypted: string; key: string } {
  // Generate a random substitution cipher
  const shuffled = [...ALPHA];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const key = shuffled.join("");
  const encrypted = text.split("").map((ch) => {
    const idx = ALPHA.indexOf(ch);
    if (idx === -1) return ch;
    return key[idx];
  }).join("");
  return { encrypted, key };
}

function vigenereEncrypt(text: string, keyword: string): string {
  let keyIdx = 0;
  return text.split("").map((ch) => {
    const idx = ALPHA.indexOf(ch);
    if (idx === -1) return ch;
    const shift = ALPHA.indexOf(keyword[keyIdx % keyword.length]);
    keyIdx++;
    return ALPHA[(idx + shift) % 26];
  }).join("");
}

function transpositionEncrypt(text: string, columns: number): string {
  // Columnar transposition
  const rows: string[][] = [];
  for (let i = 0; i < text.length; i += columns) {
    rows.push(text.slice(i, i + columns).split(""));
  }
  // Pad last row
  while (rows[rows.length - 1].length < columns) {
    rows[rows.length - 1].push("x");
  }
  let result = "";
  for (let col = 0; col < columns; col++) {
    for (const row of rows) {
      result += row[col];
    }
  }
  return result;
}

function combinedEncrypt(text: string, rng: () => number): { encrypted: string; key: string } {
  // Caesar + Vigenere combo
  const shift = Math.floor(rng() * 20) + 3;
  const keywords = ["reef", "claw", "tide", "deep", "wave"];
  const keyword = keywords[Math.floor(rng() * keywords.length)];
  const afterCaesar = caesarEncrypt(text, shift);
  const afterVigenere = vigenereEncrypt(afterCaesar, keyword);
  return { encrypted: afterVigenere, key: `caesar:${shift}+vigenere:${keyword}` };
}

export function generateCipherData(seed: number): CipherData {
  const rng = mulberry32(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const randInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;

  // Pick 5 unique phrases
  const shuffled = [...PHRASES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = shuffled.slice(0, 5);

  const messages: CipherMessage[] = [];
  const truthMessages: CipherGroundTruth["messages"] = [];

  // 1. Caesar cipher (difficulty 1)
  const caesarShift = randInt(3, 20);
  const caesar = caesarEncrypt(selected[0], caesarShift);
  messages.push({
    id: `cipher-${seed}-1`,
    difficulty: 1,
    cipher_type: "caesar",
    encrypted_text: caesar,
    hint: "A classic rotation cipher. The alphabet has been shifted by a constant amount.",
  });
  truthMessages.push({
    id: `cipher-${seed}-1`,
    plaintext: selected[0],
    cipher_type: "caesar",
    key: String(caesarShift),
    difficulty: 1,
  });

  // 2. Substitution cipher (difficulty 2)
  const sub = substitutionEncrypt(selected[1], rng);
  messages.push({
    id: `cipher-${seed}-2`,
    difficulty: 2,
    cipher_type: "substitution",
    encrypted_text: sub.encrypted,
    hint: "Each letter maps to exactly one other letter. Frequency analysis may help.",
  });
  truthMessages.push({
    id: `cipher-${seed}-2`,
    plaintext: selected[1],
    cipher_type: "substitution",
    key: sub.key,
    difficulty: 2,
  });

  // 3. Vigenere cipher (difficulty 3)
  const vKeywords = ["reef", "claw", "tide", "deep", "wave", "coral", "shell"];
  const vKey = pick(vKeywords);
  const vig = vigenereEncrypt(selected[2], vKey);
  messages.push({
    id: `cipher-${seed}-3`,
    difficulty: 3,
    cipher_type: "vigenere",
    encrypted_text: vig,
    hint: "A polyalphabetic cipher using a repeating keyword. Think Vigenere.",
  });
  truthMessages.push({
    id: `cipher-${seed}-3`,
    plaintext: selected[2],
    cipher_type: "vigenere",
    key: vKey,
    difficulty: 3,
  });

  // 4. Transposition cipher (difficulty 4)
  const cols = randInt(3, 6);
  const trans = transpositionEncrypt(selected[3].replace(/ /g, ""), cols);
  messages.push({
    id: `cipher-${seed}-4`,
    difficulty: 4,
    cipher_type: "transposition",
    encrypted_text: trans,
    hint: `Columnar transposition. The letters are rearranged, not substituted. ${cols} columns were used.`,
  });
  truthMessages.push({
    id: `cipher-${seed}-4`,
    plaintext: selected[3].replace(/ /g, ""),
    cipher_type: "transposition",
    key: String(cols),
    difficulty: 4,
  });

  // 5. Combined cipher (difficulty 5)
  const combined = combinedEncrypt(selected[4], rng);
  messages.push({
    id: `cipher-${seed}-5`,
    difficulty: 5,
    cipher_type: "combined",
    encrypted_text: combined.encrypted,
    hint: "Two layers of encryption applied in sequence. Caesar first, then Vigenere.",
  });
  truthMessages.push({
    id: `cipher-${seed}-5`,
    plaintext: selected[4],
    cipher_type: "combined",
    key: combined.key,
    difficulty: 5,
  });

  // Reference table: letter frequency in English
  const referenceTable: Record<string, string> = {
    most_common: "e, t, a, o, i, n, s, h, r",
    least_common: "z, q, x, j, k",
    common_bigrams: "th, he, in, er, an, re, on, at",
    common_words: "the, of, and, to, in, is, it, for",
  };

  const objective =
    "Decrypt all 5 encrypted messages. Each uses a progressively harder cipher: Caesar, substitution, Vigenere, transposition, and a combined cipher. Submit the plaintext for each message ID. A reference table of English letter frequencies is provided.";

  return {
    messages,
    reference_table: referenceTable,
    groundTruth: { messages: truthMessages },
    objective,
  };
}
