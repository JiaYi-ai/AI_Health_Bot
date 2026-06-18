/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Thermometer, 
  Wind, 
  Brain, 
  Droplets, 
  Sparkles, 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  FileText, 
  Printer, 
  Plus, 
  Trash2, 
  RotateCcw, 
  AlertCircle, 
  ChevronRight,
  ChevronDown,
  ChevronUp, 
  Clock, 
  ShieldCheck, 
  Smile, 
  Volume2,
  BatteryLow
} from 'lucide-react';
import { KNOWLEDGE_BASE, GENERAL_DISCLAIMER, SymptomDetails } from './symptomsData';
import { DeveloperPanel } from './components/DeveloperPanel';

interface AssessmentLogEntry {
  id: string;
  timestamp: string;
  symptomName: string;
  symptomId: string;
  causes: string[];
  careAdvice: string[];
  doctorTriggers: string[];
  completedCare: string[];
  answers: Record<string, any>;
  triageStatus: {
    recommended: boolean;
    isEmergency: boolean;
    reason: string;
  };
}

export default function App() {
  // Navigation View Mode switcher
  const [showDeveloper, setShowDeveloper] = useState<boolean>(false);

  // Symptoms Database State initialized from localStorage if available
  const [dbSymptoms, setDbSymptoms] = useState<SymptomDetails[]>(() => {
    const cached = localStorage.getItem('active_symptoms_db');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.error('Failed to parse cached database:', e);
      }
    }
    return KNOWLEDGE_BASE;
  });

  // Navigation / Selected Symptoms
  const [selectedSymptomId, setSelectedSymptomId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [committedSearchQuery, setCommittedSearchQuery] = useState("");
  
  // Answers state for symptom questionnaires, keyed by symptomId -> questionId -> value
  const [answers, setAnswers] = useState<Record<string, Record<string, any>>>({});

  // Keeps track of which symptom questionnaires have been confirmed
  const [confirmedSymptoms, setConfirmedSymptoms] = useState<Record<string, boolean>>({});

  // Checked care advice steps keyed by symptomId
  const [checkedCare, setCheckedCare] = useState<Record<string, string[]>>({});
  
  // Compiled logs of saved assessments
  const [assessmentLogs, setAssessmentLogs] = useState<AssessmentLogEntry[]>([]);

  // User Interface collapsible sections state hooks (separate toggle buttons)
  const [isSearchCollapsed, setIsSearchCollapsed] = useState<boolean>(false);
  const [isMenuCollapsed, setIsMenuCollapsed] = useState<boolean>(false);
  const [isCausesCollapsed, setIsCausesCollapsed] = useState<boolean>(false);
  const [isCareCollapsed, setIsCareCollapsed] = useState<boolean>(false);
  const [isLogsCollapsed, setIsLogsCollapsed] = useState<boolean>(false);

  // Hidden Key Listener to toggle Developer mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setShowDeveloper(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load selected symptom
  const activeSymptom = useMemo(() => {
    return dbSymptoms.find(s => s.id === selectedSymptomId) || null;
  }, [selectedSymptomId, dbSymptoms]);

  // Smart Search Matching Engine
  const matchedSymptom = useMemo(() => {
    if (!committedSearchQuery.trim()) return null;
    const query = committedSearchQuery.toLowerCase();
    let bestMatch: SymptomDetails | null = null;
    let highestScore = 0;

    for (const item of dbSymptoms) {
      let score = 0;
      
      // Exact name match
      if (query.includes(item.name.toLowerCase())) {
        score += 20;
      }
      
      // Synonym array exact/partial match
      for (const syn of item.synonyms) {
        if (query.includes(syn.toLowerCase())) {
          score += 10;
        }
      }

      // Causes keywords match
      for (const cause of item.causes) {
        const words = cause.toLowerCase().split(/\s+/);
        for (const w of words) {
          if (w.length > 3 && query.includes(w)) {
            score += 1;
          }
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = item;
      }
    }

    return highestScore >= 5 ? bestMatch : null;
  }, [committedSearchQuery, dbSymptoms]);

  // Hook to detect whether query is unrelated to symptom checkers
  const isUnrelatedQuery = useMemo(() => {
    if (!committedSearchQuery.trim()) return false;
    const q = committedSearchQuery.toLowerCase();
    const unrelatedKeywords = [
      'weather', 'joke', 'movie', 'film', 'song', 'music', 'game', 'play', 'toy', 
      'restaurant', 'recipe', 'food', 'dinner', 'lunch', 'breakfast', 'hotel', 'travel', 
      'flight', 'news', 'currency', 'stock', 'sport', 'football', 'cricket', 'basketball', 
      'fashion', 'shopping', 'clothes', 'shoe', 'funny', 'riddle', 'meme', 
      'video', 'actor', 'celebrity', 'politics', 'president'
    ];
    return unrelatedKeywords.some(keyword => q.includes(keyword));
  }, [committedSearchQuery]);

  // Hook to detect emergency keywords in search
  const isEmergencySearch = useMemo(() => {
    if (!committedSearchQuery.trim()) return false;
    const q = committedSearchQuery.toLowerCase();
    const emergencyKeywords = [
      'chest pain', 'severe bleeding', 'inability to breathe', 'breathing difficulty', 
      'difficulty breathing', 'choking', 'severe trauma', 'bleeding out', 'heart attack', 
      'stroke', 'unconscious', 'poisoning'
    ];
    return emergencyKeywords.some(keyword => q.includes(keyword));
  }, [committedSearchQuery]);

  // Toggle Care Advice item checked state
  const toggleCareItem = (symptomId: string, advice: string) => {
    setCheckedCare(prev => {
      const existing = prev[symptomId] || [];
      if (existing.includes(advice)) {
        return {
          ...prev,
          [symptomId]: existing.filter(item => item !== advice)
        };
      } else {
        return {
          ...prev,
          [symptomId]: [...existing, advice]
        };
      }
    });
  };

  // Calculate patient triage status based on active questionnaire inputs
  const calculateTriageStatus = (symptomId: string, symptomAnswers: Record<string, any>) => {
    const dangerFlags: string[] = [];
    const doctorTriggers: string[] = [];
    let isEmergency = false;

    Object.entries(symptomAnswers).forEach(([qId, val]) => {
      if (val === true) {
        if (['stiff_neck', 'chest_pain', 'head_injury', 'difficulty_breathing', 'blood_in_vomit', 'sudden_severe'].includes(qId)) {
          isEmergency = true;
          dangerFlags.push(qId.replace('_', ' '));
        } else {
          doctorTriggers.push(qId.replace('_', ' '));
        }
      }
      if (qId === 'temperature' && typeof val === 'number') {
        if (val >= 40.0) {
          isEmergency = true;
          dangerFlags.push('measured temperature exceeds 40°C');
        } else if (val >= 39.0) {
          doctorTriggers.push('high fever (measured temperature exceeds 39°C)');
        }
      }
      if (qId === 'duration' && typeof val === 'number') {
        if (symptomId === 'fever' && val >= 3) {
          doctorTriggers.push(`fever lasting ${val} days (benchmark is 3 days)`);
        }
        if (symptomId === 'cough' && val >= 3) {
          doctorTriggers.push(`dry cough lasting ${val} weeks (benchmark is 3 weeks)`);
        }
        if (symptomId === 'diarrhea' && val >= 48) {
          doctorTriggers.push(`diarrhea lasting ${val} hours (benchmark is 48 hours)`);
        }
      }
    });

    if (isEmergency) {
      return {
        recommended: true,
        isEmergency: true,
        reason: `Emergency symptoms detected: Positive for ${dangerFlags.join(', ')}. Emergency care is strictly required!`
      };
    }

    if (doctorTriggers.length > 0) {
      return {
        recommended: true,
        isEmergency: false,
        reason: `Medical consultation advised: Positive for clinical red flags: ${doctorTriggers.join(', ')}. Please schedule a physical visit.`
      };
    }

    return {
      recommended: false,
      isEmergency: false,
      reason: "No acute warnings triggered. Fully suitable for supportive offline home-care guidelines."
    };
  };

  // Add currently configuration to assessment log
  const handleAddToLog = () => {
    if (!activeSymptom) return;
    const symptomCareCompleted = checkedCare[activeSymptom.id] || [];
    const symptomAnswers = answers[activeSymptom.id] || {};
    const triage = calculateTriageStatus(activeSymptom.id, symptomAnswers);
    
    const newEntry: AssessmentLogEntry = {
      id: `${activeSymptom.id}-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      symptomName: activeSymptom.name,
      symptomId: activeSymptom.id,
      causes: [...activeSymptom.causes],
      careAdvice: [...activeSymptom.careAdvice],
      doctorTriggers: [...activeSymptom.doctorTriggers],
      completedCare: [...symptomCareCompleted],
      answers: JSON.parse(JSON.stringify(symptomAnswers)),
      triageStatus: triage
    };

    setAssessmentLogs(prev => [...prev, newEntry]);
  };

  // Delete logged entry
  const handleDeleteLogEntry = (id: string) => {
    setAssessmentLogs(prev => prev.filter(entry => entry.id !== id));
  };

  const getSymptomIcon = (id: string) => {
    switch (id) {
      case 'fever': return <Thermometer id="icon-fever" className="w-5 h-5 text-amber-600 sm:w-6 sm:h-6" />;
      case 'cough': return <Wind id="icon-cough" className="w-5 h-5 text-teal-600 sm:w-6 sm:h-6" />;
      case 'headache': return <Brain id="icon-headache" className="w-5 h-5 text-indigo-600 sm:w-6 sm:h-6" />;
      case 'diarrhea': return <Droplets id="icon-diarrhea" className="w-5 h-5 text-cyan-600 sm:w-6 sm:h-6" />;
      case 'rash': return <Sparkles id="icon-rash" className="w-5 h-5 text-rose-600 sm:w-6 sm:h-6" />;
      case 'sore_throat': return <Volume2 id="icon-throat" className="w-5 h-5 text-emerald-600 sm:w-6 sm:h-6" />;
      case 'nausea': return <Activity id="icon-nausea" className="w-5 h-5 text-purple-600 sm:w-6 sm:h-6" />;
      case 'fatigue': return <BatteryLow id="icon-fatigue" className="w-5 h-5 text-amber-600 sm:w-6 sm:h-6" />;
      case 'dizziness': return <Brain id="icon-dizziness" className="w-5 h-5 text-cyan-600 sm:w-6 sm:h-6" />;
      case 'body_aches': return <Activity id="icon-body-aches" className="w-5 h-5 text-rose-600 sm:w-6 sm:h-6" />;
      default: return <Activity id="icon-default" className="w-5 h-5 text-slate-600 sm:w-6 sm:h-6" />;
    }
  };



  return (
    <div className="min-h-screen bg-[#fdfcf9] text-[#3c3c3b] font-sans print:bg-white print:p-0">
      
      {/* Top Professional Banner Disclaimer - Visible & Important */}
      <div id="disclaimer-banner" className="bg-gradient-to-r from-[#5d6d4e] to-[#455239] text-white text-xs text-center py-2.5 px-4 font-medium tracking-wide shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
          <AlertCircle className="w-4 h-4 text-[#e8ece0] shrink-0" />
          <span>{GENERAL_DISCLAIMER}</span>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* Application Header - Modern clean Aura Natural theme */}
        <header id="clinical-header" className="flex flex-col md:flex-row md:items-center md:justify-between py-6 border-b border-[#e9e4d9] gap-4 print:hidden">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div 
                className="p-2.5 bg-[#5d6d4e] text-white rounded-full flex items-center justify-center shadow-inner cursor-pointer select-none"
                onDoubleClick={() => setShowDeveloper(prev => !prev)}
                title="Double click to access developer mode in secret"
              >
                <Activity className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h1 
                  id="clinical-title" 
                  className="text-2xl font-serif font-black tracking-tight text-[#2a2a29] sm:text-3xl cursor-pointer select-none"
                  onDoubleClick={() => setShowDeveloper(prev => !prev)}
                  title="Double click to access developer mode in secret"
                >
                  Health Assistant
                </h1>
                <p className="text-xs text-[#8a867c] font-medium uppercase tracking-widest leading-none">
                  AI Symptom Analysis
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold bg-[#f1f0ea] text-[#6b665c] uppercase tracking-wider border border-[#e2dfd5] shadow-2xs">
              <ShieldCheck className="w-3.5 h-3.5 text-[#5d6d4e]" />
              Educational Purposes Only
            </span>
            {showDeveloper && (
              <button
                type="button"
                id="toggle-developer-view"
                onClick={() => setShowDeveloper(false)}
                className="px-3 py-1.5 bg-[#9c4c35] text-white rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-rose-950 transition cursor-pointer"
              >
                Exit Developer Tools
              </button>
            )}
          </div>
        </header>

        {/* Collapsible Developer Workspace Panel */}
        {showDeveloper && (
          <div className="mb-6 animate-none">
            <DeveloperPanel
              dbSymptoms={dbSymptoms}
              onUpdateDatabase={(newDb) => {
                setDbSymptoms(newDb);
                localStorage.setItem('active_symptoms_db', JSON.stringify(newDb));
              }}
            />
          </div>
        )}
            {/* 2-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start print:hidden">
          
          {/* LEFT COLUMN: Search & Selectors (Grid 5) */}
          <div className="lg:col-span-5 space-y-6 print:hidden">
            
            {/* Search Input Widget */}
            {!showDeveloper && (
              <div id="search-card" className="bg-white rounded-2xl border border-[#e9e4d9] shadow-xs p-4 sm:p-5 hover:border-[#dfe4d4] transition">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-[#2a2a29] flex items-center gap-2 uppercase tracking-wide">
                    <Search className="w-4 h-4 text-[#5d6d4e]" />
                    Describe How You Feel
                  </h2>
                  <button
                    type="button"
                    id="toggle-search-card"
                    onClick={() => setIsSearchCollapsed(!isSearchCollapsed)}
                    className="p-1.5 hover:bg-[#faf9f6] text-[#8a867c] hover:text-[#5d6d4e] rounded-xl border border-[#faf9f6] hover:border-[#e9e4d9] transition cursor-pointer"
                    title={isSearchCollapsed ? "Expand section" : "Collapse section"}
                  >
                    {isSearchCollapsed ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronUp className="w-4 h-4" />
                    )}
                  </button>
                </div>              {!isSearchCollapsed && (
                  <div className="space-y-4">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (searchQuery.trim()) {
                          setCommittedSearchQuery(searchQuery);
                        }
                      }}
                      className="flex gap-2"
                    >
                      <div className="relative flex-1">
                        <input
                          id="symptom-search"
                          type="text"
                          placeholder="e.g., headache, feeling hot, cough..."
                          value={searchQuery}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSearchQuery(val);
                            // Clear previous search results upon typed changes
                            setCommittedSearchQuery("");
                          }}
                          className="w-full pl-10 pr-12 py-3 bg-[#faf9f6]/95 border border-[#e2dfd5] text-[#3c3c3b] rounded-xl text-sm placeholder-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#5d6d4e] focus:border-transparent transition"
                        />
                        <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-[#8a867c]" />
                        {searchQuery && (
                          <button 
                            type="button"
                            onClick={() => {
                              setSearchQuery("");
                              setCommittedSearchQuery("");
                            }}
                            className="absolute right-3 top-3 text-[10px] bg-[#e2dfd5] hover:bg-[#d9d4c7] px-2 py-1 rounded text-[#6b665c] font-bold cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <button
                        type="submit"
                        id="symptom-search-confirm-btn"
                        disabled={!searchQuery.trim()}
                        className="px-4 py-3 bg-[#5d6d4e] hover:bg-[#4d5c3f] disabled:bg-[#f1f0ea] disabled:text-[#8a867c] disabled:border-[#e2dfd5] disabled:cursor-not-allowed border border-[#5d6d4e] disabled:border-[#e2dfd5] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs shrink-0"
                      >
                        Confirm
                      </button>
                    </form>

                    {/* Safety First: Immediate acute emergency warn block */}
                    {committedSearchQuery && isEmergencySearch && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-800 space-y-1.5"
                      >
                        <div className="flex items-center gap-1.5 font-bold text-rose-900 uppercase tracking-wide">
                          <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse" />
                          <span>🚨 Critical Emergency Warning</span>
                        </div>
                        <p className="leading-normal text-rose-700">
                          You have entered or described emergency symptom concepts (such as chest pain, severe bleeding, or breathing difficulty). 
                          <strong> Online guidelines are not safe for addressing life-threatening emergencies. Please call emergency medical services immediately!</strong>
                        </p>
                      </motion.div>
                    )}

                    {/* Topic limitation warning for completely unrelated entries */}
                    {committedSearchQuery && !isEmergencySearch && isUnrelatedQuery && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1.5"
                      >
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 uppercase tracking-wide">
                          <AlertCircle className="w-4 h-4 text-slate-500" />
                          <span>Topic Limitation Advisor</span>
                        </div>
                        <p className="leading-normal text-slate-500">
                          Your input looks like an unrelated topic (e.g. weather, entertainment, games, or general questions). 
                          As a specialized offline Symptom Checker, I do not provide assistance on generic non-health domains. 
                          <strong>Please enter a medical concern (such as fever, cough, skin rash, or headache) to perform analysis.</strong>
                        </p>
                      </motion.div>
                    )}

                    {/* Knowledge Base Based: Beyond scope warning */}
                    {committedSearchQuery && !isEmergencySearch && !isUnrelatedQuery && committedSearchQuery.trim().length > 2 && !matchedSymptom && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-[11px] text-[#7c5b1b] space-y-1.5"
                      >
                        <div className="flex items-center gap-1.5 font-bold text-amber-900 uppercase tracking-wide">
                          <AlertCircle className="w-4 h-4 text-amber-600" />
                          <span>Symptom Beyond Scope</span>
                        </div>
                        <p className="leading-normal text-[#9c7832]">
                          This system operates on a curated static database of 7 high-frequency clinical indicators. 
                          The symptom described exceeds our static dictionary, meaning custom diagnostics may be inaccurate. 
                          <strong>We strongly advise consulting a medical doctor or clinical professional directly.</strong>
                        </p>
                      </motion.div>
                    )}

                    {/* Dynamic matched indicator */}
                    <AnimatePresence>
                      {committedSearchQuery && matchedSymptom && (
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="mt-3.5 p-3 bg-[#f1f3ec] border border-[#dfe4d4] rounded-xl flex items-center justify-between shadow-2xs"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-[#5d6d4e] bg-[#e8ece0] px-2 py-1 rounded uppercase tracking-wider">
                              Assistant Match
                            </span>
                            <p className="text-xs font-semibold text-[#3c3c3b]">
                              {matchedSymptom.name}
                            </p>
                          </div>
                          <button
                            type="button"
                            id="select-matched-btn"
                            onClick={() => {
                              setSelectedSymptomId(matchedSymptom.id);
                              setSearchQuery("");
                              setCommittedSearchQuery("");
                            }}
                            className="text-xs font-bold text-[#5d6d4e] hover:text-[#455239] flex items-center gap-0.5 cursor-pointer font-sans"
                          >
                            Inspect Now
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            )}

            {/* Quick selectors list */}
            {!showDeveloper && (
              <div id="selection-card" className="bg-white rounded-2xl border border-[#e9e4d9] shadow-xs p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-md font-serif italic text-[#4a463f]">
                    Symptom Menu
                  </h2>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] text-[#8a867c] font-mono font-bold bg-[#faf9f6]/95 border border-[#e9e4d9] px-2 py-0.5 rounded">
                      {dbSymptoms.length} Reference Guides
                    </span>
                    <button
                      type="button"
                      id="toggle-menu-widget"
                      onClick={() => setIsMenuCollapsed(!isMenuCollapsed)}
                      className="p-1.5 hover:bg-[#faf9f6] text-[#8a867c] hover:text-[#5d6d4e] rounded-xl border border-[#faf9f6] hover:border-[#e9e4d9] transition cursor-pointer"
                      title={isMenuCollapsed ? "Expand menu" : "Collapse menu"}
                    >
                      {isMenuCollapsed ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronUp className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {!isMenuCollapsed && (
                  <div id="symptoms-list-grid" className="max-h-[480px] overflow-y-auto pr-1 space-y-2.5 custom-scrollbar animate-none">
                    {dbSymptoms.map((item) => {
                      const isActive = selectedSymptomId === item.id;
                      return (
                        <button
                          id={`symptom-select-${item.id}`}
                          key={item.id}
                          onClick={() => setSelectedSymptomId(item.id)}
                          className={`w-full text-left p-3.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                            isActive
                              ? "bg-[#f1f3ec]/80 border-[#5d6d4e] ring-1 ring-[#5d6d4e] shadow-2xs"
                              : "bg-[#faf9f6] border-[#e9e4d9] hover:bg-[#faf9f6]/90 hover:border-[#dfe4d4]"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${isActive ? 'bg-[#e8ece0] text-[#5d6d4e]' : 'bg-white border border-[#e9e4d9] shadow-2xs'}`}>
                              {getSymptomIcon(item.id)}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-[#2a2a29]">{item.name}</p>
                              <p className="text-xs text-[#8a867c] line-clamp-1 italic">
                                {item.causes.slice(0, 2).join(", ")}
                              </p>
                            </div>
                          </div>
                          {isActive && <CheckCircle2 className="w-5 h-5 text-[#5d6d4e] shrink-0 ml-2" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}



          </div>

          {/* RIGHT COLUMN: Interactive Symptom Board (Grid 7) */}
          <div className="lg:col-span-7 print:hidden">
            <AnimatePresence mode="wait">
              {!activeSymptom ? (
                // Blank State
                !showDeveloper && (
                  <motion.div
                    id="blank-board"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    className="bg-white rounded-2xl border border-[#e9e4d9] p-8 text-center shadow-xs space-y-4 py-20 flex flex-col items-center justify-center"
                  >
                    <div className="w-16 h-16 bg-[#faf9f6] border border-[#e9e4d9] text-[#8a867c] rounded-full flex items-center justify-center">
                      <Activity className="w-8 h-8 text-[#5d6d4e]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-serif italic text-[#4a463f]">No Symptom Selected</h3>
                      <p className="text-sm text-[#8a867c] max-w-sm mx-auto mt-1 leading-relaxed">
                        Choose an option from the left sidebar or utilize search to inspect possible support.
                      </p>
                    </div>
                  </motion.div>
                )
              ) : (
                (() => {
                  const symptomAnswers = answers[activeSymptom.id] || {};
                  const allQuestionsCount = activeSymptom.questions ? activeSymptom.questions.length : 0;
                  const answeredQuestionsCount = activeSymptom.questions
                    ? activeSymptom.questions.filter(q => symptomAnswers[q.id] !== undefined).length
                    : 0;
                  const isQuestionnaireComplete = answeredQuestionsCount === allQuestionsCount;
                  const isConfirmed = !!confirmedSymptoms[activeSymptom.id];
                  const triageResult = calculateTriageStatus(activeSymptom.id, symptomAnswers);

                  return (
                    // Active Symptom Panel
                    <motion.div
                      id={`board-${activeSymptom.id}`}
                      key={activeSymptom.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      className="space-y-6"
                    >
                      {/* Title Bar with causes */}
                      {!showDeveloper && (
                        <div className="bg-white border border-[#e9e4d9] rounded-2xl p-5 shadow-xs space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 bg-[#f1f3ec] rounded-full text-[#5d6d4e]">
                                {getSymptomIcon(activeSymptom.id)}
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a867c]">Symptom Analysis</p>
                                <h2 className="text-xl font-serif font-bold text-[#2a2a29]">{activeSymptom.name}</h2>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {/* Separate toggle button for Possible Causes */}
                              <button
                                type="button"
                                id="toggle-causes-widget"
                                onClick={() => setIsCausesCollapsed(!isCausesCollapsed)}
                                className="p-1.5 hover:bg-[#faf9f6]/95 text-[#8a867c] hover:text-[#5d6d4e] rounded-xl border border-[#faf9f6] hover:border-[#e9e4d9] transition cursor-pointer"
                                title={isCausesCollapsed ? "Expand Causes" : "Collapse Causes"}
                              >
                                {isCausesCollapsed ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronUp className="w-4 h-4" />
                                )}
                              </button>

                              <button
                                id="deselect-btn"
                                onClick={() => setSelectedSymptomId(null)}
                                className="text-xs text-[#8a867c] hover:text-[#5d6d4e] font-semibold underline underline-offset-2 cursor-pointer"
                              >
                                Reset Select
                              </button>
                            </div>
                          </div>

                          {!isCausesCollapsed && (
                            <div className="bg-[#faf9f6] rounded-xl p-4 border border-[#e9e4d9] animate-none space-y-4">
                              <div>
                                <h4 className="text-[10px] font-bold uppercase text-[#5a564c] tracking-widest mb-1.5 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 bg-[#5d6d4e] rounded-full" />
                                  Possible Cause
                                </h4>
                                <p className="text-xs text-[#2a2a29] font-medium leading-relaxed bg-white/60 p-2.5 rounded-lg border border-[#e9e4d9]">
                                  {activeSymptom.causes.join(', ')}
                                </p>
                              </div>

                              <div>
                                <h4 className="text-[10px] font-bold uppercase text-[#5a564c] tracking-widest mb-1.5 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 bg-[#5d6d4e] rounded-full" />
                                  Care Advice
                                </h4>
                                <p className="text-xs text-[#2a2a29] font-medium leading-relaxed bg-white/60 p-2.5 rounded-lg border border-[#e9e4d9]">
                                  {activeSymptom.careAdvice.join(', ')}
                                </p>
                              </div>

                              <div>
                                <h4 className="text-[10px] font-bold uppercase text-[#5a564c] tracking-widest mb-1.5 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 bg-[#9c4c35] rounded-full" />
                                  When to See a Doctor
                                </h4>
                                <p className="text-xs text-[#9c4c35] font-semibold leading-relaxed bg-[#fdf3f0] p-2.5 rounded-lg border border-[#f2d6cd]">
                                  {activeSymptom.doctorTriggers.join('. ')}
                                </p>
                              </div>


                            </div>
                          )}
                        </div>
                      )}

                      {/* Diagnostic Questionnaire Section */}
                      {!showDeveloper && (
                        <div className="bg-white border border-[#e9e4d9] rounded-2xl p-5 shadow-xs space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#f1f0ea] pb-3">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 bg-[#faf1eb] text-[#c0734e] rounded-full flex items-center justify-center text-xs font-bold font-sans">1</span>
                              <h3 className="text-sm font-serif font-bold text-[#3c3c3b] uppercase tracking-wide">
                                Clinical Symptom Questionnaire
                              </h3>
                            </div>
                            <div className="flex items-center gap-2">
                              {answeredQuestionsCount > 0 && (
                                <button
                                  type="button"
                                  id="reset-questionnaire-btn"
                                  onClick={() => {
                                    setAnswers(prev => {
                                      const updated = { ...prev };
                                      delete updated[activeSymptom.id];
                                      return updated;
                                    });
                                    setConfirmedSymptoms(prev => ({
                                      ...prev,
                                      [activeSymptom.id]: false
                                    }));
                                  }}
                                  className="text-[10px] text-rose-800 hover:text-white bg-rose-50 hover:bg-rose-700 border border-rose-200 hover:border-transparent px-2.5 py-1 rounded-md font-sans font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all duration-200"
                                  title="Reset all current answers for this symptom questionnaire"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Reset Answers
                                </button>
                              )}
                              <div className="text-[10px] bg-[#f1f0ea] border border-[#e2dfd5] text-[#6b665c] px-2.5 py-1 rounded-md font-mono font-bold uppercase tracking-wide">
                                Progress: {answeredQuestionsCount} / {allQuestionsCount} Answered
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            {activeSymptom.questions.map((q) => {
                              const currentVal = symptomAnswers[q.id];
                              return (
                                <div key={q.id} className="p-3.5 bg-[#faf9f6]/80 border border-[#e9e4d9] rounded-xl space-y-2.5 hover:border-[#dfe4d4] transition">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                      <p className="text-xs font-bold text-[#3c3c3b] leading-tight">
                                        {q.text}
                                      </p>
                                      {q.description && (
                                        <p className="text-[10px] text-[#8a867c] italic">
                                          {q.description}
                                        </p>
                                      )}
                                    </div>

                                    {/* Inputs */}
                                    <div className="shrink-0">
                                      {q.type === 'boolean' ? (
                                        <div className="flex items-center gap-1 bg-white border border-[#e2dfd5] p-1 rounded-lg">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setAnswers(prev => ({
                                                ...prev,
                                                [activeSymptom.id]: {
                                                  ...(prev[activeSymptom.id] || {}),
                                                  [q.id]: true
                                                }
                                              }));
                                              setConfirmedSymptoms(prev => ({ ...prev, [activeSymptom.id]: false }));
                                            }}
                                            className={`px-3 py-1 text-[11px] font-bold uppercase rounded-md transition cursor-pointer ${
                                              currentVal === true
                                                ? "bg-rose-950 text-white shadow-2xs"
                                                : "text-[#6b665c] hover:bg-rose-50 hover:text-[#9c4c35]"
                                            }`}
                                          >
                                            Yes
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setAnswers(prev => ({
                                                ...prev,
                                                [activeSymptom.id]: {
                                                  ...(prev[activeSymptom.id] || {}),
                                                  [q.id]: false
                                                }
                                              }));
                                              setConfirmedSymptoms(prev => ({ ...prev, [activeSymptom.id]: false }));
                                            }}
                                            className={`px-3 py-1 text-[11px] font-bold uppercase rounded-md transition cursor-pointer ${
                                              currentVal === false
                                                ? "bg-[#5d6d4e] text-white shadow-2xs"
                                                : "text-[#6b665c] hover:bg-[#f1f3ec] hover:text-[#5d6d4e]"
                                            }`}
                                          >
                                            No
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="range"
                                            min={q.unit === '°C' ? 35.0 : 0}
                                            max={q.unit === '°C' ? 42.0 : q.unit === 'hours' ? 72 : 30}
                                            step={q.unit === '°C' ? 0.1 : 1}
                                            value={currentVal !== undefined ? currentVal : (q.unit === '°C' ? 37.0 : 0)}
                                            onChange={(e) => {
                                              const numericVal = parseFloat(e.target.value);
                                              setAnswers(prev => ({
                                                ...prev,
                                                [activeSymptom.id]: {
                                                  ...(prev[activeSymptom.id] || {}),
                                                  [q.id]: numericVal
                                                }
                                              }));
                                              setConfirmedSymptoms(prev => ({ ...prev, [activeSymptom.id]: false }));
                                            }}
                                            className="accent-[#5d6d4e] w-24 h-1 bg-[#e2dfd5] rounded-lg appearance-none cursor-pointer"
                                          />
                                          <div className="flex items-center gap-1">
                                            <input
                                              type="number"
                                              step={q.unit === '°C' ? 0.1 : 1}
                                              value={currentVal !== undefined ? currentVal : ""}
                                              placeholder={q.unit === '°C' ? "37.0" : "0"}
                                              onChange={(e) => {
                                                const textVal = e.target.value;
                                                const numericVal = textVal === "" ? undefined : parseFloat(textVal);
                                                setAnswers(prev => ({
                                                  ...prev,
                                                  [activeSymptom.id]: {
                                                    ...(prev[activeSymptom.id] || {}),
                                                    [q.id]: numericVal
                                                  }
                                                }));
                                                setConfirmedSymptoms(prev => ({ ...prev, [activeSymptom.id]: false }));
                                              }}
                                              className="w-14 text-center text-xs font-bold bg-white text-[#3c3c3b] border border-[#e2dfd5] py-0.5 px-1 rounded focus:outline-none focus:ring-1 focus:ring-[#5d6d4e]"
                                            />
                                            <span className="text-[10px] font-bold text-[#8a867c] shrink-0 font-mono">
                                              {q.unit || ""}
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Confirmation Button Block */}
                          <div className="pt-3 border-t border-dashed border-[#e9e4d9]">
                            {!isQuestionnaireComplete ? (
                              <div className="bg-[#fcfaf4] border border-amber-100 p-3 rounded-xl flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                                <p className="text-[11px] text-[#8c672b] leading-tight">
                                  Please answer all <strong>{allQuestionsCount - answeredQuestionsCount}</strong> remaining question(s) above to display triaged home-care guidance and save capabilities.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {!isConfirmed ? (
                                  <motion.div 
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="text-center bg-[#f7f8f4] border border-[#d9dfd0] p-4 rounded-xl space-y-3"
                                  >
                                    <p className="text-xs text-[#5d6d4e] font-semibold">
                                      ✓ All diagnostic questions answered. Click below to verify parameters:
                                    </p>
                                    <button
                                      type="button"
                                      id="confirm-input-btn"
                                      onClick={() => {
                                        setConfirmedSymptoms(prev => ({
                                          ...prev,
                                          [activeSymptom.id]: true
                                        }));
                                      }}
                                      className="w-full sm:w-auto px-6 py-2.5 bg-[#5d6d4e] hover:bg-[#4d5c3f] text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-md hover:shadow-lg hover:translate-y-[-1px] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                      <CheckCircle2 className="w-4 h-4 text-white" />
                                      Confirm Diagnosis Details
                                    </button>
                                  </motion.div>
                                ) : (
                                  <div className="bg-emerald-50/50 border border-emerald-150 p-3 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                      <p className="text-[11px] text-emerald-800 font-semibold leading-none">
                                        ✓ Questionnaire inputs confirmed & triaged below.
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      id="modify-inputs-btn"
                                      onClick={() => {
                                        setConfirmedSymptoms(prev => ({
                                          ...prev,
                                          [activeSymptom.id]: false
                                        }));
                                      }}
                                      className="text-[10px] text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-400 bg-white px-2.5 py-1 rounded-lg font-bold uppercase tracking-wide cursor-pointer flex items-center gap-0.5"
                                    >
                                      Modify Answers
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Display Care & Log compiling only if Questionnaire completed and confirmed */}
                      {isConfirmed && !showDeveloper && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-6"
                        >
                          {/* Dynamic Triage Alert Card */}
                          <div className={`p-4 rounded-2xl border space-y-2 ${
                            triageResult.isEmergency
                              ? "bg-rose-50 border-rose-200 text-rose-800 animate-none"
                              : triageResult.recommended
                                ? "bg-amber-50 border-amber-200 text-amber-800"
                                : "bg-emerald-50 border-emerald-200 text-emerald-800"
                          }`}>
                            <div className="flex items-center gap-2 font-bold uppercase text-[10px] tracking-wider">
                              {triageResult.isEmergency ? (
                                <>
                                  <AlertTriangle className="w-4 h-4 text-rose-600 animate-bounce" />
                                  <span className="text-rose-900">🚨 EMERGENCY CRITICAL WARNING</span>
                                </>
                              ) : triageResult.recommended ? (
                                <>
                                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                                  <span className="text-amber-900">⚠️ Professional Consultation Advised</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-4 h-4 text-emerald-650" />
                                  <span className="text-emerald-900">🟢 Supportive Care Safe</span>
                                </>
                              )}
                            </div>
                            <p className="text-xs font-semibold leading-relaxed">
                              {triageResult.reason}
                            </p>
                            {triageResult.isEmergency && (
                              <div className="p-2.5 bg-white border border-rose-100 rounded-lg text-[10px] text-rose-950 font-bold leading-normal">
                                ⚠️ EMERGENCY NOTICE: Please do not treat these acute symptoms at home. Direct clinical evaluation by emergency room physicians or calling emergency medical services is strictly recommended.
                              </div>
                            )}
                          </div>

                          {/* Care Advice Checklist Section */}
                          <div className="bg-white border border-[#e9e4d9] rounded-2xl p-5 shadow-sm space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#f1f0ea] pb-3">
                              <h3 className="text-md font-serif font-bold text-[#3c3c3b] flex items-center gap-1.5">
                                <span className="w-5 h-5 bg-[#f1f3ec] text-[#5d6d4e] rounded-full flex items-center justify-center text-xs font-bold font-sans">2</span>
                                Supportive Self-Care Advice
                              </h3>
                              <div className="flex items-center gap-2.5">
                                <span className="text-[11px] font-mono font-bold text-[#8a867c]">
                                  ({(checkedCare[activeSymptom.id] || []).length} of {activeSymptom.careAdvice.length} Ticked)
                                </span>
                                <button
                                  type="button"
                                  id="toggle-care-widget"
                                  onClick={() => setIsCareCollapsed(!isCareCollapsed)}
                                  className="p-1.5 hover:bg-[#faf9f6]/95 text-[#8a867c] hover:text-[#5d6d4e] rounded-xl border border-[#faf9f6] hover:border-[#e9e4d9] transition cursor-pointer font-bold shrink-0"
                                  title={isCareCollapsed ? "Expand Care Advice" : "Collapse Care Advice"}
                                >
                                  {isCareCollapsed ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronUp className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {!isCareCollapsed && (
                              <>
                                <p className="text-xs text-[#8a867c]">
                                  While symptoms represent non-critical levels, follow this exact guideline database advice to restore comfort:
                                </p>

                                <div id="care-checkbox-list" className="space-y-2">
                                  {activeSymptom.careAdvice.map((advice, index) => {
                                    const isChecked = (checkedCare[activeSymptom.id] || []).includes(advice);
                                    return (
                                      <div
                                        id={`advice-container-${index}`}
                                        key={index}
                                        onClick={() => toggleCareItem(activeSymptom.id, advice)}
                                        className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                                          isChecked
                                            ? "bg-[#f1f3ec] border-[#dfe4d4] text-[#3c3c3b]"
                                            : "bg-[#faf9f6]/90 hover:bg-[#f1f0ea] text-[#6b665c] border-[#e9e4d9]"
                                        }`}
                                      >
                                        <span className="text-xs font-semibold leading-relaxed">
                                          {advice}
                                        </span>
                                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ml-3 ${
                                          isChecked ? "bg-[#5d6d4e] border-transparent text-white" : "border-[#e9e4d9] bg-white"
                                        }`}>
                                          {isChecked && <CheckCircle2 className="w-3.5 h-3.5" />}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Completion bar indicator if any item ticked */}
                                {activeSymptom.careAdvice.length > 0 && (
                                  <div className="pt-2">
                                    <div className="w-full bg-[#f4f2eb] rounded-full h-1.5 overflow-hidden">
                                      <div 
                                        className="bg-[#5d6d4e] h-full transition-all duration-300" 
                                        style={{ 
                                          width: `${(((checkedCare[activeSymptom.id] || []).length) / activeSymptom.careAdvice.length) * 100}%` 
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          {/* Add action log to assessment summary */}
                          <div className="flex items-center justify-between gap-3 bg-[#faf9f6] border border-[#e9e4d9] p-4 rounded-2xl">
                            <div className="space-y-0.5">
                              <p className="text-xs font-semibold text-[#3c3c3b]">Compile Report Card</p>
                              <p className="text-[11px] text-[#8a867c]">Save this record to the printable assessment log below.</p>
                            </div>
                            <button
                              id="add-assessment-btn"
                              onClick={handleAddToLog}
                              className="px-4 py-2 bg-[#5d6d4e] hover:bg-[#4d5c3f] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs active:scale-95 transition"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add to Assessment Log
                            </button>
                          </div>
                        </motion.div>
                      )}

                    </motion.div>
                  );
                })()
              )}
            </AnimatePresence>
          </div>

        </div>

        {/* BOTTOM FULL WIDTH PANEL: Active Assessment Report Logs (Interactive clinical output) */}
        {!showDeveloper && (
          <section id="assessment-logs-section" className="bg-white border border-[#e9e4d9] rounded-2xl p-5 shadow-xs space-y-6 print:border-none print:shadow-none print:p-0">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#f1f0ea] pb-4">
            <div className="space-y-1">
              <h2 className="text-md font-serif font-bold text-[#2a2a29] flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#5d6d4e]" />
                Medical Provider Summary & Reports Log
              </h2>
              <p className="text-xs text-[#8a867c] print:hidden">
                Add multiple symptom queries to easily compare them side-by-side or format a printer-ready summary sheets to show your GP doctor.
              </p>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                id="toggle-logs-widget"
                onClick={() => setIsLogsCollapsed(!isLogsCollapsed)}
                className="p-1.5 hover:bg-[#faf9f6]/95 text-[#8a867c] hover:text-[#5d6d4e] rounded-xl border border-[#e9e4d9] transition cursor-pointer font-bold shrink-0 shadow-2xs"
                title={isLogsCollapsed ? "Expand Log List" : "Collapse Log List"}
              >
                {isLogsCollapsed ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronUp className="w-4 h-4" />
                )}
              </button>

              {assessmentLogs.length > 0 && (
                <>
                  <button
                    id="print-summary-btn"
                    onClick={() => window.print()}
                    className="px-3 py-2 bg-[#2a2a29] hover:bg-black text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Health Summary
                  </button>
                  <button
                    id="reset-summary-btn"
                    onClick={() => {
                      if (confirm("Clear all compiled assessment reports in this session?")) {
                        setAssessmentLogs([]);
                      }
                    }}
                    className="px-3 py-2 bg-[#faf9f6]/80 hover:bg-[#f1f0ea] text-[#6b665c] text-xs font-bold rounded-xl flex items-center gap-1.5 border border-[#e9e4d9] transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Clear All
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Active Empty Logs State wrapped print-safely */}
          <div className={`${isLogsCollapsed ? 'hidden print:block' : 'block'} space-y-6 animate-none`}>
            {assessmentLogs.length === 0 ? (
              <div id="logs-empty-view" className="text-center py-10 text-[#8a867c] space-y-2 border-2 border-dashed border-[#e9e4d9] rounded-xl print:hidden">
                <FileText className="w-10 h-10 mx-auto text-[#bfbbb0] animate-bounce" />
                <div>
                  <p className="text-sm font-bold text-[#3c3c3b]">No Assessment Logs Compiled</p>
                  <p className="text-xs text-[#8a867c]">Select symptoms above and tap "Add to Assessment Log" to create your doctor sheet report.</p>
                </div>
              </div>
            ) : (
              // Compiled report layout
              <div id="compiled-assessment-sheets" className="space-y-6">
              
              {/* Doctor Sheet Greeting Information - formatted cleanly for clinical use */}
              <div className="bg-[#faf9f6] border border-[#e9e4d9] rounded-xl p-4 space-y-3 print:bg-white print:border-slate-350">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs font-semibold text-[#6b665c] gap-1.5">
                  <span className="text-xs">Patient Applet Self-Assessment History</span>
                  <span className="font-mono text-[10px]">Session Generated: {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border-t border-[#e9e4d9] pt-2.5">
                    <span className="text-[10px] font-bold uppercase text-[#8a867c] block">Assessment Target</span>
                    <span className="text-xs font-extrabold text-[#2a2a29]">Symptom Checker Assistant Offline Export</span>
                  </div>
                  <div className="border-t border-[#e9e4d9] pt-2.5">
                    <span className="text-[10px] font-bold uppercase text-[#8a867c] block">Total Reports Logged</span>
                    <span className="text-xs font-extrabold text-[#5d6d4e]">{assessmentLogs.length} Checked Symptom Categories</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-[#e9e4d9] text-[11px] text-[#8a867c] italic">
                  *Disclaimer to Health Provider: This report represents self-disclosed client answers compiled using a static health database containing general educational advice. No diagnosis is modeled.
                </div>
              </div>

              {/* Grid of logged symptom entries */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {assessmentLogs.map((entry) => (
                  <div 
                    id={`report-entry-${entry.id}`}
                    key={entry.id} 
                    className={`border border-[#e9e4d9] rounded-xl p-4 space-y-4 shadow-2xs relative print:border-slate-400 break-inside-avoid ${
                      entry.triageStatus.recommended ? "bg-[#fdf3f0]/40 border-[#f2d6cd]" : "bg-white"
                    }`}
                  >
                    
                    {/* Delete button (hidden in print) */}
                    <button
                      id={`delete-entry-${entry.id}`}
                      onClick={() => handleDeleteLogEntry(entry.id)}
                      className="absolute right-3 top-3 text-[#bfbbb0] hover:text-[#9c4c35] p-1 rounded-lg hover:bg-[#f1f0ea] transition print:hidden animate-none"
                      title="Remove assessment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-2">
                      <div className="text-[#5d6d4e] shrink-0">
                        {getSymptomIcon(entry.symptomId)}
                      </div>
                      <div>
                        <h3 className="font-serif font-extrabold text-[#2a2a29] text-sm leading-tight">
                          {entry.symptomName}
                        </h3>
                        <span className="text-[10px] font-mono font-bold text-[#8a867c]">
                          Assessment Added: {entry.timestamp}
                        </span>
                      </div>
                    </div>

                    {/* Database Guidance details */}
                    <div className="bg-[#faf9f6] rounded-xl p-4 border border-[#e9e4d9] space-y-3.5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-[#8a867c] tracking-wider block mb-1">
                            Possible Cause:
                          </span>
                          <p className="text-xs text-[#3c3c3b] font-medium bg-white border border-[#eae6db] p-2 rounded-lg">
                            {entry.causes.join(', ')}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase text-[#8a867c] tracking-wider block mb-1">
                            Care Advice:
                          </span>
                          <p className="text-xs text-[#3c3c3b] font-medium bg-white border border-[#eae6db] p-2 rounded-lg">
                            {entry.careAdvice.join(', ')}
                          </p>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold uppercase text-[#8a867c] tracking-wider block mb-1">
                          When to See a Doctor:
                        </span>
                        <p className="text-xs text-[#9c4c35] font-semibold bg-[#fdf3f0] border border-[#f2d6cd] p-2 rounded-lg">
                          {entry.doctorTriggers.join('. ')}
                        </p>
                      </div>
                    </div>

                    {/* Disclosed Parameters List */}
                    {entry.answers && Object.keys(entry.answers).length > 0 && (
                      <div className="bg-[#faf9f6]/90 rounded-lg p-3 space-y-1.5 border border-[#e9e4d9] print:bg-white print:border-slate-300">
                        <h4 className="text-[10px] font-bold uppercase text-[#8a867c] tracking-wider">
                          Disclosed Health Parameters:
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          {Object.entries(entry.answers).map(([key, val]) => (
                            <div key={key} className="flex justify-between items-center text-[11px] border-b border-[#e9e4d9]/55 pb-1 last:border-0 print:border-slate-200">
                              <span className="text-[#6b665c] capitalize">{key.replace('_', ' ')}:</span>
                              <span className="font-extrabold text-[#3c3c3b]">
                                {typeof val === 'boolean' ? (val ? 'Yes' : 'No') : `${val}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Triage Evaluation alert */}
                    {entry.triageStatus && (
                      <div className={`p-3 rounded-lg border text-xs leading-relaxed ${
                        entry.triageStatus.isEmergency 
                          ? "bg-rose-50 border-rose-250 text-rose-800" 
                          : entry.triageStatus.recommended 
                            ? "bg-amber-50 border-amber-250 text-amber-800"
                            : "bg-emerald-55/40 border-emerald-250 text-emerald-800"
                      }`}>
                        <p className="font-bold flex items-center gap-1.5 uppercase text-[9px] tracking-wider mb-0.5">
                          {entry.triageStatus.isEmergency ? "🚨 Emergency Triage Warning:" : entry.triageStatus.recommended ? "⚠️ Consultation Suggested:" : "🟢 Supportive Care Safe:"}
                        </p>
                        <p className="text-[11px] font-semibold">{entry.triageStatus.reason}</p>
                      </div>
                    )}

                    {/* Self-Care completion */}
                    <div className="space-y-1">
                      <h4 className="text-[10px] font-bold uppercase text-[#8a867c] tracking-wider">
                        Home care steps tracked:
                      </h4>
                      {entry.completedCare.length === 0 ? (
                        <p className="text-xs text-[#8a867c] italic">No care steps flagged completed.</p>
                      ) : (
                        <ul className="text-xs text-[#6b665c] space-y-1">
                          {entry.completedCare.map((care, i) => (
                            <li key={i} className="flex items-center gap-1 text-[#3c3c3b] font-semibold">
                              <span className="text-[#5d6d4e]">✓</span> {care}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                  </div>
                ))}
              </div>

              {/* Dedicated Print Only Header/Footer Elements */}
              <div id="print-watermark" className="hidden print:block text-center text-[10px] text-[#8a867c] border-t border-[#e9e4d9] pt-4 mt-8">
                <p>Symptom Checker Assistant - Secure Client-Side Patient Export Record Form</p>
                <p className="mt-1 text-[#bfbbb0]">Printed automatically for medical information display purposes. Protect absolute patient confidentiality.</p>
              </div>

            </div>
          )}
          </div>

        </section>
        )}

        {/* Global Footer */}
        <footer id="assessment-footer" className="text-center text-xs text-[#8a867c] pt-10 border-t border-[#e9e4d9] mt-12 pb-8 space-y-3.5 print:hidden">
          {!showDeveloper && (
            <div className="max-w-2xl mx-auto space-y-2">
              <p className="font-semibold text-[#3c3c3b]">Curated Static Knowledge Base Covers:</p>
              <p className="text-[11px] tracking-wide leading-relaxed">
                Fever • Persistent Dry Cough • Acute Headache • Diarrhea • Mild Skin Rash • Sore Throat • Nausea and Vomiting.
              </p>
            </div>
          )}
          <div className="bg-[#faf9f6] p-4 border border-[#e9e4d9] rounded-xl text-[11px] max-w-3xl mx-auto italic leading-normal text-[#6b665c]">
            <strong>Educational Disclaimer Statement:</strong> {GENERAL_DISCLAIMER} No machine intelligence models or static code are equipped to provide genuine diagnosis or clinical emergency support. Please consult emergency medical services immediately if experiencing difficulty breathing, choking, severe trauma, or major bleeding.
          </div>

        </footer>

      </div>

      {/* Global CSS Inject to ensure print mode renders beautifully */}
      <style>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          #disclaimer-banner,
          #clinical-header,
          header,
          #search-card,
          #selection-card,
          #helper-card,
          #blank-board,
          #deselect-btn,
          [id^="board-"],
          [id^="advice-container-"],
          #add-assessment-btn,
          #print-summary-btn,
          #reset-summary-btn,
          [id^="delete-entry-"],
          #logs-empty-view,
          #assessment-footer,
          .lg\\:col-span-12,
          .lg\\:col-span-5 {
            display: none !important;
          }
          #assessment-logs-section {
            display: block !important;
            width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          #compiled-assessment-sheets {
            display: block !important;
          }
          .grid {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 1.5rem !important;
          }
          .print\\:border-slate-400 {
            border-color: #94a3b8 !important;
          }
          .print\\:p-0 {
            padding: 0 !important;
          }
        }
      `}</style>

    </div>
  );
}

