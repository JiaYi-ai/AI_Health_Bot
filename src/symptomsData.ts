export interface SymptomDetails {
  id: string;
  name: string;
  causes: string[];
  careAdvice: string[];
  doctorTriggers: string[];
  questions: {
    id: string;
    text: string;
    type: "boolean" | "number";
    unit?: string;
    description?: string;
  }[];
  synonyms: string[];
}

export const csvContent = `Symptom,Possible Cause,Care Advice,When to See a Doctor
Fever (High body temperature),"Viral infection (like flu or dengue), bacterial infection, or dehydration.","Rest adequately, drink plenty of water or oral rehydration salts, and take paracetamol if needed to reduce discomfort.","Seek medical care if the fever lasts more than 3 days, exceeds 39°C, or is accompanied by a severe headache or stiff neck."
Persistent Dry Cough,"Upper respiratory tract infection, allergies, asthma, or environmental irritants (like haze).","Stay hydrated with warm water, use a humidifier, avoid smoking/dust, and consider soothing home remedies like warm honey-lemon water.","Consult a doctor if the cough lasts longer than 3 weeks, causes chest pain, or if you start coughing up yellow/green phlegm or blood."
Acute Headache,"Tension, lack of sleep, eye strain, dehydration, or a migraine episode.","Rest in a quiet, dark room, practice relaxation techniques, stay hydrated, and use over-the-counter pain relievers if necessary.","See a doctor immediately if it is a sudden, severe ""thunderclap"" headache, follows a head injury, or comes with blurred vision and dizziness."
"Diarrhea (Loose, watery stools)","Food poisoning, contaminated water, viral gastroenteritis (stomach flu), or mild food intolerance.","Drink frequent small sips of water, isotonic drinks, or rehydration solutions to prevent fluid loss. Eat bland foods like rice, bananas, and toast.","Visit a clinic if diarrhea lasts more than 48 hours, is accompanied by a high fever, severe abdominal pain, or signs of deep dehydration."
Mild Skin Rash,"Allergic reaction (to food, soap, or cosmetics), insect bites, heat rash, or contact dermatitis.","Keep the area clean and dry, avoid scratching to prevent secondary infections, and apply a cool compress or mild calamine lotion.","Seek medical attention if the rash spreads rapidly across the body, starts blistering, causes severe pain, or is accompanied by a fever."
Sore Throat,"Common cold, viral pharyngitis, straining your voice, or a bacterial infection like strep throat.","Gargle with warm salt water multiple times a day, drink soothing warm fluids, and rest your voice as much as possible.","Consult a medical professional if you experience difficulty swallowing or breathing, severe joint pain, or if the sore throat lasts over a week."
Nausea and Vomiting,"Mild indigestion, motion sickness, early-stage food poisoning, or gastritis.","Sip clear, cold fluids slowly. Avoid solid foods for a few hours, then gradually reintroduce plain, non-greasy foods like crackers or plain porridge.","Go to a doctor if you cannot keep fluids down for more than 24 hours, experience severe abdominal pain, or vomit blood."`;

// Robust CSV Parsing Utility that handles quoted fields with commas
export function parseCSV(csvText: string): string[][] {
  const lines = csvText.split(/\r?\n/);
  const result: string[][] = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    result.push(row);
  }
  return result;
}

// Interactive questionnaires and synonyms matching skeletons
const METADATA_SKELETONS: Record<string, {
  matchKeywords: string[];
  synonyms: string[];
  questions: {
    id: string;
    text: string;
    type: "boolean" | "number";
    unit?: string;
    description?: string;
  }[];
}> = {
  fever: {
    matchKeywords: ["fever"],
    synonyms: ["fever", "feverish", "high temperature", "chills", "sweating", "hot", "feeling warm", "flu", "dengue", "temperature", "pyrexia"],
    questions: [
      {
        id: "duration",
        text: "How many days has the fever lasted?",
        type: "number",
        unit: "days"
      },
      {
        id: "temperature",
        text: "What is your measured body temperature?",
        type: "number",
        unit: "°C"
      },
      {
        id: "stiff_neck",
        text: "Do you have a severe headache or stiff neck?",
        type: "boolean"
      }
    ]
  },
  cough: {
    matchKeywords: ["cough"],
    synonyms: ["cough", "coughing", "dry cough", "throat tickle", "irritation", "wheezing", "asthma", "bronchitis"],
    questions: [
      {
        id: "duration",
        text: "How many weeks has the cough lasted?",
        type: "number",
        unit: "weeks"
      },
      {
        id: "chest_pain",
        text: "Are you experiencing chest pain?",
        type: "boolean"
      },
      {
        id: "blood_mucus",
        text: "Are you coughing up blood or thick green/yellow mucus?",
        type: "boolean"
      }
    ]
  },
  headache: {
    matchKeywords: ["headache"],
    synonyms: ["headache", "head pain", "migraine", "head hurt", "tension headache", "head aching", "brow pain", "temples hurting", "throbbing head"],
    questions: [
      {
        id: "sudden_severe",
        text: "Was this a sudden, extremely severe ('thunderclap') headache?",
        type: "boolean"
      },
      {
        id: "head_injury",
        text: "Did you recently experience a head injury?",
        type: "boolean"
      },
      {
        id: "vision_dizzy",
        text: "Are you experiencing blurred vision or dizziness?",
        type: "boolean"
      }
    ]
  },
  diarrhea: {
    matchKeywords: ["diarrhea"],
    synonyms: ["diarrhea", "diarrhoea", "loose stool", "loose stools", "watery poop", "stomach flu", "food poisoning", "gastroenteritis", "running stomach"],
    questions: [
      {
        id: "duration",
        text: "How many hours has the diarrhea lasted?",
        type: "number",
        unit: "hours"
      },
      {
        id: "high_fever",
        text: "Do you also have a high fever?",
        type: "boolean"
      },
      {
        id: "abdominal_pain",
        text: "Do you have severe abdominal pain?",
        type: "boolean"
      },
      {
        id: "dehydration_signs",
        text: "Are you noticing signs of dehydration (extreme thirst, dry mouth, little to no urination)?",
        type: "boolean"
      }
    ]
  },
  rash: {
    matchKeywords: ["rash"],
    synonyms: ["rash", "skin rash", "itchy skin", "spots", "red bumps", "hives", "insect bite", "skin allergy", "dermatitis", "bumps"],
    questions: [
      {
        id: "spreads_rapidly",
        text: "Is the rash spreading rapidly across your body?",
        type: "boolean"
      },
      {
        id: "blisters",
        text: "Are there blisters or open sores forming?",
        type: "boolean"
      },
      {
        id: "severe_pain",
        text: "Are you experiencing severe pain or burning sensations at the rash site?",
        type: "boolean"
      },
      {
        id: "has_fever",
        text: "Is the rash accompanied by a fever?",
        type: "boolean"
      }
    ]
  },
  sore_throat: {
    matchKeywords: ["sore throat"],
    synonyms: ["sore throat", "throat pain", "throat hurts", "swallowing hurts", "scratchy throat", "strep throat", "pharyngitis", "voice strain"],
    questions: [
      {
        id: "difficulty_swallowing",
        text: "Are you experiencing difficulty swallowing food or liquids?",
        type: "boolean"
      },
      {
        id: "difficulty_breathing",
        text: "Are you having difficulty or pain when breathing?",
        type: "boolean"
      },
      {
        id: "duration",
        text: "Have your symptoms lasted more than one week?",
        type: "boolean"
      }
    ]
  },
  nausea: {
    matchKeywords: ["nausea"],
    synonyms: ["nausea", "vomiting", "vomit", "throw up", "nauseous", "morning sickness", "motion sickness", "seasick", "feeling sick", "indigestion", "gastritis"],
    questions: [
      {
        id: "fluids_down",
        text: "Have you been unable to keep any fluids down for more than 24 hours?",
        type: "boolean"
      },
      {
        id: "severe_abdominal_pain",
        text: "Are you experiencing severe abdominal pain?",
        type: "boolean"
      },
      {
        id: "blood_in_vomit",
        text: "Has blood appeared in your vomit (e.g. coffee-ground appearance or bright red)?",
        type: "boolean"
      }
    ]
  }
};

const parsedCSVRows = parseCSV(csvContent);
const dataRows = parsedCSVRows.slice(1);

export const KNOWLEDGE_BASE: SymptomDetails[] = [];

for (const row of dataRows) {
  if (row.length < 4) continue;
  const rawSymptom = row[0];
  const rawCauses = row[1];
  const rawCareAdvice = row[2];
  const rawDoctorTriggers = row[3];

  const matchEntry = Object.entries(METADATA_SKELETONS).find(([_, skeleton]) => {
    return skeleton.matchKeywords.some(keyword => rawSymptom.toLowerCase().includes(keyword));
  });

  if (matchEntry) {
    const [id, skeleton] = matchEntry;

    // Splits and trims causes, careAdvices, and doctorTriggers
    const splitCauses = rawCauses
      .split(/[.,;]\s*(?:or|and)?\s*/gi)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1));

    const splitCareAdvice = rawCareAdvice
      .split(/[.,;]\s*(?:or|and)?\s*/gi)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1));

    const splitDoctorTriggers = rawDoctorTriggers
      .split(/[.;]\s*(?:or|and)?\s*/gi)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1));

    KNOWLEDGE_BASE.push({
      id,
      name: rawSymptom,
      causes: splitCauses.length > 0 ? splitCauses : [rawCauses],
      careAdvice: splitCareAdvice.length > 0 ? splitCareAdvice : [rawCareAdvice],
      doctorTriggers: splitDoctorTriggers.length > 0 ? splitDoctorTriggers : [rawDoctorTriggers],
      questions: skeleton.questions,
      synonyms: skeleton.synonyms
    });
  }
}

export const GENERAL_DISCLAIMER = "This application is for educational purposes only and does not replace professional medical advice, diagnosis, or treatment. Always consult healthcare professionals for serious symptoms.";
