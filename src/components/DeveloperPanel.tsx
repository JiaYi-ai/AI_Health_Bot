import React, { useState, useEffect } from 'react';
import { 
  Database, 
  RefreshCw, 
  FileSpreadsheet, 
  Plus, 
  Trash, 
  Edit3, 
  Save, 
  LogOut, 
  ExternalLink, 
  AlertCircle, 
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  AlertTriangle,
  Activity,
  Cpu
} from 'lucide-react';
import { SymptomDetails } from '../symptomsData';
import { 
  googleSignIn, 
  logout, 
  getAccessToken, 
  initAuth 
} from '../auth';
import { 
  createTemplateSpreadsheet, 
  fetchDatabaseFromSpreadsheet, 
  pushDatabaseToSpreadsheet 
} from '../sheetsService';
import { User } from 'firebase/auth';

interface DeveloperPanelProps {
  dbSymptoms: SymptomDetails[];
  onUpdateDatabase: (newDb: SymptomDetails[]) => void;
}

export function DeveloperPanel({ dbSymptoms, onUpdateDatabase }: DeveloperPanelProps) {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Spreadsheet configuration state
  const [spreadsheetId, setSpreadsheetId] = useState<string>(() => {
    return localStorage.getItem('symptom_spreadsheet_id') || '';
  });
  const [isSavedId, setIsSavedId] = useState(!!spreadsheetId);

  // Status logs and processing flags
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error' | 'info' | null; message: string }>({
    type: null,
    message: ''
  });
  const [isProcessing, setIsProcessing] = useState(false);

  // Separate toggle states for Developer sections
  const [isSyncCollapsed, setIsSyncCollapsed] = useState(false);
  const [isGridCollapsed, setIsGridCollapsed] = useState(false);

  // Single centralized "Input Window" Modal State
  const [isInputWindowOpen, setIsInputWindowOpen] = useState(false);
  const [editingSymptomId, setEditingSymptomId] = useState<string | null>(null); // Null means creating new row
  
  // Single flattened Form state equivalent to the columns of the table
  const [formFields, setFormFields] = useState({
    id: '',
    name: '',
    causes: '',
    careAdvice: '',
    doctorTriggers: '',
    synonyms: '',
    questions: '' // Flat newline list of check questions
  });

  // Reference lookup state
  const [lookupQuery, setLookupQuery] = useState('');
  const [isLookupCollapsed, setIsLookupCollapsed] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<{
    type: 'database' | 'api' | 'inference' | 'none';
    message?: string;
    dbData?: SymptomDetails;
    apiData?: {
      name: string;
      synonyms: string[];
      icd10cm_code?: string;
    };
    inferenceData?: {
      name: string;
      possibleCauses: string[];
      careRecommendations: string[];
      whenToSeeDoctor: string[];
    };
  } | null>(null);

  const handleLookupSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = lookupQuery.trim();
    if (!query) return;

    setIsLookupLoading(true);
    setLookupResult(null);

    const lowerQuery = query.toLowerCase();

    // 1. Search existing local database
    const dbMatch = dbSymptoms.find(s => {
      const matchName = s.name.toLowerCase() === lowerQuery;
      const matchNameInclude = s.name.toLowerCase().includes(lowerQuery) || lowerQuery.includes(s.name.toLowerCase());
      const matchSynonym = s.synonyms.some(syn => syn.toLowerCase() === lowerQuery || syn.toLowerCase().includes(lowerQuery) || lowerQuery.includes(syn.toLowerCase()));
      return matchName || matchSynonym || matchNameInclude;
    });

    if (dbMatch) {
      // Database has the highest priority. If found, use DB data and DO NOT call API.
      setLookupResult({
        type: 'database',
        dbData: dbMatch
      });
      setIsLookupLoading(false);
      return;
    }

    // 2. Call the Clinical Tables API
    try {
      const url = `https://clinicaltables.nlm.nih.gov/api/conditions/v3/search?terms=${encodeURIComponent(query)}&sf=primary_name,synonyms&df=primary_name,synonyms,icd10cm_code`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      const count = data[0] || 0;
      const details = data[3] || [];

      if (count > 0 && details.length > 0) {
        const matchRow = details[0];
        const apiName = matchRow[0] || '';
        const apiSynonymsRaw = matchRow[1];
        let apiSynonyms: string[] = [];
        if (Array.isArray(apiSynonymsRaw)) {
          apiSynonyms = apiSynonymsRaw;
        } else if (typeof apiSynonymsRaw === 'string') {
          apiSynonyms = apiSynonymsRaw.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
        const icdCode = matchRow[2] || undefined;

        // Conflict Resolution: If API returns information identical to existing DB symptom, ignore API, use DB.
        const dbDuplicate = dbSymptoms.find(s => 
          s.name.toLowerCase() === apiName.toLowerCase() ||
          s.synonyms.some(syn => syn.toLowerCase() === apiName.toLowerCase()) ||
          apiSynonyms.some(syn => s.name.toLowerCase() === syn.toLowerCase())
        );

        if (dbDuplicate) {
          setLookupResult({
            type: 'database',
            dbData: dbDuplicate,
            message: 'Conflict Resolution: Result matched database record. Switched to database-authoritative copy.'
          });
        } else {
          setLookupResult({
            type: 'api',
            apiData: {
              name: apiName,
              synonyms: apiSynonyms,
              icd10cm_code: icdCode
            }
          });
        }
        setIsLookupLoading(false);
        return;
      }
    } catch (err: any) {
      console.error("Clinical Tables API error:", err);
    }

    // 3. Model Inference Fallback (If no match in DB and no match in API / API error)
    const cleanInferenceName = query.charAt(0).toUpperCase() + query.slice(1);
    let inferredCauses = ["General physiological stress or clinical strain", "Atypical immune reaction or minor systemic irritation", "Metabolic, circadian, or environmental triggers"];
    let inferredAdvice = ["Practice hydration, rest, and keep detailed symptom logs", "Consult a certified healthcare practitioner directly", "Avoid intensive somatic exposures or heavy exertion"];
    let inferredDoctorRedflags = ["Symptoms persist beyond 4-7 days with increasing severity", "Developing high fever, worsening body temperature, or localized swelling", "Any acute breathing fatigue or pain"];

    const lower = query.toLowerCase();
    if (lower.includes('eye') || lower.includes('vision')) {
      inferredCauses = ["Eye strain, lacrimal duct exhaustion, or localized dry eye syndrome", "Allergic conjunctivitis or particulate eye irritation"];
      inferredAdvice = ["Adopt the 20-20-20 screen relaxation routine", "Apply pure non-preserved lubricating drops", "Rest eyes in high-contrast shaded lighting"];
    } else if (lower.includes('stomach') || lower.includes('belly') || lower.includes('gut') || lower.includes('pain') && (lower.includes('ache') || lower.includes('cramp'))) {
      inferredCauses = ["Minor smooth muscle hypermotility or gastric irritation", "Metabolic food allergy or transient pocket gas retention"];
      inferredAdvice = ["Sip plain ambient water or warm herbal tea slowly", "Consume easily digestible plain foods like dry toast", "Place a warm heat pack over lower abdominal muscles"];
    } else if (lower.includes('joint') || lower.includes('knee') || lower.includes('bone') || lower.includes('muscle') || lower.includes('back')) {
      inferredCauses = ["Muscle strain, myofascial trigger points, or ligamentous overuse", "Ergonomic stress or exposure to atmospheric changes"];
      inferredAdvice = ["Apply mild cold compresses alternately with light stretching", "Ensure ergonomic spinal supports in sitting postures"];
    } else if (lower.includes('skin') || lower.includes('itch') || lower.includes('dry')) {
      inferredCauses = ["Xerosis cutting skin hydration or external standard product allergy", "Exposure to harsh ambient chemical surfactants or cold air"];
      inferredAdvice = ["Apply hypoallergenic dense daily barrier skin ointments", "Take lukewarm baths, avoiding generic abrasive scrubbing"];
    }

    setLookupResult({
      type: 'inference',
      inferenceData: {
        name: cleanInferenceName,
        possibleCauses: inferredCauses,
        careRecommendations: inferredAdvice,
        whenToSeeDoctor: inferredDoctorRedflags
      }
    });
    setIsLookupLoading(false);
  };

  // Observe Auth state on mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (activeUser, token) => {
        setUser(activeUser);
        setAccessToken(token);
        setLoadingAuth(false);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setLoadingAuth(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    setSyncStatus({ type: null, message: '' });
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        setSyncStatus({ type: 'success', message: `Logged in as ${result.user.email} successfully!` });
      }
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: `Sign in failed: ${err.message || err}` });
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
      setUser(null);
      setAccessToken(null);
      setSyncStatus({ type: 'info', message: 'Signed out of Google Workspace account.' });
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: `Sign out failed: ${err.message}` });
    }
  };

  const handleSaveSpreadsheetId = () => {
    if (spreadsheetId.trim()) {
      localStorage.setItem('symptom_spreadsheet_id', spreadsheetId.trim());
      setIsSavedId(true);
      setSyncStatus({ type: 'success', message: 'Spreadsheet ID saved locally.' });
    } else {
      localStorage.removeItem('symptom_spreadsheet_id');
      setIsSavedId(false);
    }
  };

  // Google Sheets integration actions
  const handleCreateTemplate = async () => {
    const token = accessToken || getAccessToken();
    if (!token) {
      setSyncStatus({ type: 'error', message: 'Please Sign in with Google to create a spreadsheet.' });
      return;
    }

    const conf = window.confirm(
      "This will create a new 'AI Symptom Checker Database' Google Sheet in your Google Drive and preload it with the default symptom records. Go ahead?"
    );
    if (!conf) return;

    setIsProcessing(true);
    setSyncStatus({ type: 'info', message: 'Creating spreadsheet template in your Google Drive...' });

    try {
      const result = await createTemplateSpreadsheet(token, dbSymptoms);
      setSpreadsheetId(result.spreadsheetId);
      localStorage.setItem('symptom_spreadsheet_id', result.spreadsheetId);
      setIsSavedId(true);
      setSyncStatus({ 
        type: 'success', 
        message: `Template configured successfully! Spreadsheet ID: ${result.spreadsheetId}. Click link below to open.` 
      });
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: err.message || 'Error creating template.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFetchFromSheet = async () => {
    const token = accessToken || getAccessToken();
    if (!token) {
      setSyncStatus({ type: 'error', message: 'Please Sign in with Google first.' });
      return;
    }
    if (!spreadsheetId.trim()) {
      setSyncStatus({ type: 'error', message: 'Please specify a Google Spreadsheet ID.' });
      return;
    }

    setIsProcessing(true);
    setSyncStatus({ type: 'info', message: 'Loading database from Google Sheet...' });

    try {
      const fetchedSymptoms = await fetchDatabaseFromSpreadsheet(token, spreadsheetId.trim());
      onUpdateDatabase(fetchedSymptoms);
      setSyncStatus({ 
        type: 'success', 
        message: `Successfully synchronized ${fetchedSymptoms.length} rows with Google Sheets database!` 
      });
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: err.message || 'Synchronization failed.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePushToSheet = async () => {
    const token = accessToken || getAccessToken();
    if (!token) {
      setSyncStatus({ type: 'error', message: 'Please Sign in with Google first.' });
      return;
    }
    if (!spreadsheetId.trim()) {
      setSyncStatus({ type: 'error', message: 'Please specify a Google Spreadsheet ID.' });
      return;
    }

    const confirmed = window.confirm(
      "⚠️ WARNING: This will overwrite ALL rows inside your connected spreadsheet's 'Symptoms' and 'Questions' sheets with your current local edit structures. Go ahead?"
    );
    if (!confirmed) return;

    setIsProcessing(true);
    setSyncStatus({ type: 'info', message: 'Writing active database states back to the Google Sheet...' });

    try {
      await pushDatabaseToSpreadsheet(token, spreadsheetId.trim(), dbSymptoms);
      setSyncStatus({ type: 'success', message: 'Successfully saved and synchronized all database records to the spreadsheet!' });
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: err.message || 'Error occurred while saving modifications to Sheet.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Local CRUD helper functions for Symptoms row table
  const handleDeleteRow = (symId: string) => {
    const conf = window.confirm(`Delete row "${symId}" from local database? (Remember to push changes to save back to Sheets)`);
    if (!conf) return;

    const filtered = dbSymptoms.filter(s => s.id !== symId);
    onUpdateDatabase(filtered);
  };

  const handleOpenEditWindow = (sym: SymptomDetails) => {
    setEditingSymptomId(sym.id);
    setFormFields({
      id: sym.id,
      name: sym.name,
      causes: sym.causes.join('\n'),
      careAdvice: sym.careAdvice.join('\n'),
      doctorTriggers: sym.doctorTriggers.join('\n'),
      synonyms: sym.synonyms.join(', '),
      questions: sym.questions.map(q => q.text).join('\n')
    });
    setIsInputWindowOpen(true);
  };

  const handleOpenAddWindow = () => {
    setEditingSymptomId(null);
    setFormFields({
      id: '',
      name: '',
      causes: '',
      careAdvice: '',
      doctorTriggers: '',
      synonyms: '',
      questions: ''
    });
    setIsInputWindowOpen(true);
  };

  const handleSaveInputWindow = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = formFields.id.trim().toLowerCase().replace(/\s+/g, '_');
    if (!cleanId || !formFields.name.trim()) {
      alert("ID and Name fields are required!");
      return;
    }

    // Parse flat questions input (one per line) on-the-fly back into schema structures!
    const questionsArray = formFields.questions
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map((text, idx) => {
        // Find existing match to preserve specific types/units if appropriate
        const orgSym = dbSymptoms.find(s => s.id === editingSymptomId);
        const existing = orgSym?.questions.find(q => q.text.toLowerCase() === text.toLowerCase());
        
        let type: 'boolean' | 'number' = 'boolean';
        let unit: string | undefined = undefined;
        const lower = text.toLowerCase();
        if (lower.includes('temperature') || lower.includes('body temperature') || lower.includes('measured body')) {
          type = 'number';
          unit = '°C';
        } else if (lower.includes('how many days') || lower.includes('how many hours') || lower.includes('duration') || lower.includes('how many weeks')) {
          type = 'number';
          unit = lower.includes('hours') ? 'hours' : lower.includes('weeks') ? 'weeks' : 'days';
        }

        return {
          id: existing?.id || `q_${cleanId}_${idx + 1}`,
          text: text,
          type: existing?.type || type,
          unit: existing?.unit || unit
        };
      });

    const updatedRow: SymptomDetails = {
      id: cleanId,
      name: formFields.name.trim(),
      causes: formFields.causes.split('\n').map(c => c.trim()).filter(c => c),
      careAdvice: formFields.careAdvice.split('\n').map(c => c.trim()).filter(c => c),
      doctorTriggers: formFields.doctorTriggers.split('\n').map(c => c.trim()).filter(c => c),
      synonyms: formFields.synonyms.split(',').map(s => s.trim().toLowerCase()).filter(s => s),
      questions: questionsArray
    };

    if (editingSymptomId === null) {
      // Adding a new row
      if (dbSymptoms.some(s => s.id === cleanId)) {
        alert(`Symptom row with ID "${cleanId}" already exists!`);
        return;
      }
      onUpdateDatabase([...dbSymptoms, updatedRow]);
    } else {
      // Editing existing row
      const modified = dbSymptoms.map(s => s.id === editingSymptomId ? updatedRow : s);
      onUpdateDatabase(modified);
    }

    setIsInputWindowOpen(false);
  };

  return (
    <div id="developer-workspace" className="space-y-6">
      
      {/* Google Drive Connection & Integration Header */}
      <div className="bg-[#faf9f6]/95 border border-[#e9e4d9] rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-[#e9e4d9] pb-4 gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-[#5d6d4e] bg-[#e8ece0] px-2 py-0.5 rounded uppercase tracking-wider">
              Clinical Database Synchronization Client
            </span>
            <h2 className="text-lg font-serif italic text-[#4a463f] flex items-center gap-2">
              <Database className="w-5 h-5 text-[#5d6d4e]" />
              Database Connection Control
            </h2>
            <p className="text-xs text-[#8a867c]">
              Synchronize localized states with Google Sheets as an active remote relational database.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Separate toggle button */}
            <button
              type="button"
              id="toggle-sync-control"
              onClick={() => setIsSyncCollapsed(!isSyncCollapsed)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 leading-none cursor-pointer border border-[#e2dfd5] bg-white hover:bg-[#f1f0ea]"
            >
              {isSyncCollapsed ? (
                <>
                  <ChevronDown className="w-4 h-4 text-[#5d6d4e]" />
                  <span>Expand Connection Control</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-4 h-4 text-[#5d6d4e]" />
                  <span>Collapse Connection Control</span>
                </>
              )}
            </button>

            {loadingAuth ? (
              <span className="text-xs text-[#8a867c] animate-pulse font-mono">Verifying...</span>
            ) : user ? (
              <div className="flex items-center gap-2.5 bg-white border border-[#e9e4d9] px-3.5 py-1.5 rounded-xl text-xs">
                {user.photoURL && (
                  <img src={user.photoURL} alt="pfp" className="w-5 h-5 rounded-full border border-[#d2cbbe]" referrerPolicy="no-referrer" />
                )}
                <div>
                  <p className="font-semibold text-[#3c3c3b] leading-tight text-[11px]">{user.displayName || 'Developer'}</p>
                  <p className="text-[9px] text-[#8a867c] leading-none font-mono">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  title="Disconnect account"
                  className="p-1 text-[#9c4c35] hover:bg-[#fcf3f0] rounded-lg transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                className="gsi-material-button text-xs py-1.5"
              >
                <div className="gsi-material-button-state"></div>
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents font-semibold text-xs">Authorize Drive Integration</span>
                </div>
              </button>
            )}
          </div>
        </div>

        {!isSyncCollapsed && (
          <>
            {/* Database ID Connection inputs */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end animate-none">
              <div className="md:col-span-8 space-y-1.5">
                <label className="text-xs font-bold text-[#6b665c] block uppercase tracking-wider">
                  Connected Spreadsheet Identification Key
                </label>
                <div className="relative flex rounded-xl border border-[#e2dfd5] bg-white focus-within:ring-2 focus-within:ring-[#5d6d4e]">
                  <input
                    id="dev-spreadsheet-id"
                    type="text"
                    placeholder="Spreadsheet ID key..."
                    value={spreadsheetId}
                    onChange={(e) => {
                      setSpreadsheetId(e.target.value);
                      setIsSavedId(false);
                    }}
                    className="w-full bg-transparent px-4 py-2.5 text-xs text-[#3c3c3b] focus:outline-none font-mono"
                  />
                  <div className="flex items-center gap-1.5 pr-2 shrink-0">
                    {!isSavedId && spreadsheetId.trim() && (
                      <button
                        type="button"
                        onClick={handleSaveSpreadsheetId}
                        className="text-[10px] font-extrabold bg-[#5d6d4e] hover:bg-[#455239] text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-2xs"
                      >
                        <Save className="w-3.5 h-3.5" /> Save ID
                      </button>
                    )}
                    {isSavedId && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-[#f1f3ec] text-[#5d6d4e] px-2.5 py-1 rounded-lg font-bold border border-[#dfe4d4]">
                        <Check className="w-3 h-3" /> Bound
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="md:col-span-4">
                <button
                  type="button"
                  id="btn-create-template"
                  disabled={isProcessing || !user}
                  onClick={handleCreateTemplate}
                  className={`w-full py-2.5 text-xs font-bold border rounded-xl flex items-center justify-center gap-1.5 transition ${
                    user 
                      ? "bg-white hover:bg-[#faf9f6] text-[#5d6d4e] border-[#5d6d4e] cursor-pointer" 
                      : "bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed"
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Initialize New Database
                </button>
              </div>
            </div>

            {/* Connection Action Operations */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#e9e4d9] animate-none">
              <div>
                {spreadsheetId.trim() && (
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${spreadsheetId.trim()}/edit`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#5d6d4e] font-semibold hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View Raw Sheet Tables
                  </a>
                )}
              </div>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  id="btn-fetch-sheets"
                  disabled={isProcessing || !user || !spreadsheetId.trim()}
                  onClick={handleFetchFromSheet}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition ${
                    user && spreadsheetId.trim()
                      ? "bg-white text-[#3c3c3b] border-[#e2dfd5] hover:bg-[#faf9f6]"
                      : "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                  Fetch Remote Rows
                </button>

                <button
                  type="button"
                  id="btn-push-sheets"
                  disabled={isProcessing || !user || !spreadsheetId.trim()}
                  onClick={handlePushToSheet}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 text-white transition ${
                    user && spreadsheetId.trim()
                      ? "bg-[#5d6d4e] hover:bg-[#455239]"
                      : "bg-slate-300 cursor-not-allowed"
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  Push Modifiable Changes
                </button>
              </div>
            </div>
          </>
        )}

        {/* Sync notices */}
        {syncStatus.type && (
          <div 
            id="sync-status-card"
            className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs transition ${
              syncStatus.type === 'success' 
                ? 'bg-[#f1f3ec] border-[#dfe4d4] text-[#455239]' 
                : syncStatus.type === 'error'
                  ? 'bg-[#fdf3f0] border-[#f2d6cd] text-[#9c4c35]'
                  : 'bg-white border-[#e9e4d9] text-[#6b665c]'
            }`}
          >
            <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-snug">
              <span>{syncStatus.message}</span>
            </div>
            <button 
              type="button"
              onClick={() => setSyncStatus({ type: null, message: '' })} 
              className="text-[#8a867c] hover:text-[#3c3c3b]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Clinical Terminology Search & Reference Explorer (Secondary Data Source Lookup) */}
      <div className="bg-white rounded-2xl border border-[#e9e4d9] p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#faf9f6] pb-3.5 gap-3">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-[#9c4c35] bg-[#fdf3f0] px-2 py-0.5 rounded uppercase tracking-wider">
              Secondary Reference search
            </span>
            <h3 className="text-[14px] font-bold text-[#3c3c3b] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#9c4c35]" />
              Clinical tables & Reference Explorer
            </h3>
            <p className="text-xs text-[#8a867c]">
              Check terms, cross-reference external clinical tables, and inspect diagnostic advice.
            </p>
          </div>
          
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsLookupCollapsed(!isLookupCollapsed)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 leading-none cursor-pointer border border-[#e2dfd5] bg-white hover:bg-[#faf9f6]"
            >
              {isLookupCollapsed ? (
                <>
                  <ChevronDown className="w-4 h-4 text-[#5d6d4e]" />
                  <span>Expand Explorer</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-4 h-4 text-[#5d6d4e]" />
                  <span>Collapse Explorer</span>
                </>
              )}
            </button>
          </div>
        </div>

        {!isLookupCollapsed && (
          <div className="space-y-4 animate-none">
            <form onSubmit={handleLookupSearch} className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="e.g., eye fatigue, stomach ache, joint pain..."
                  value={lookupQuery}
                  onChange={(e) => setLookupQuery(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 bg-[#faf9f6]/95 border border-[#e2dfd5] text-[#3c3c3b] rounded-xl text-sm placeholder-[#8a867c] focus:outline-none focus:ring-2 focus:ring-[#5d6d4e] focus:border-transparent transition"
                />
                <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-[#8a867c]" />
                {lookupQuery && (
                  <button 
                    type="button"
                    onClick={() => {
                      setLookupQuery("");
                      setLookupResult(null);
                    }}
                    className="absolute right-3 top-3 text-[10px] bg-[#e2dfd5] hover:bg-[#d9d4c7] px-2 py-1 rounded text-[#6b665c] font-bold cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={isLookupLoading || !lookupQuery.trim()}
                className="px-5 py-3 bg-[#5d6d4e] hover:bg-[#4d5c3f] disabled:bg-[#f1f0ea] disabled:text-[#8a867c] disabled:border-[#e2dfd5] disabled:cursor-not-allowed border border-[#5d6d4e] disabled:border-[#e2dfd5] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs shrink-0"
              >
                {isLookupLoading ? "Lookup..." : "Search Reference"}
              </button>
            </form>

            {lookupResult && (
              <div className="p-4 rounded-xl border bg-[#faf9f6]/80 border-[#e9e4d9] space-y-4">
                {/* Result Type Banner Label */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e9e4d9] pb-2 text-[10px] font-bold uppercase tracking-wider">
                  {lookupResult.type === 'database' && (
                    <span className="text-[#5d6d4e] bg-[#e8ece0] px-2.5 py-1 rounded-md">
                      ✓ Authoritative Local Database Record Match (Highest Priority)
                    </span>
                  )}
                  {lookupResult.type === 'api' && (
                    <span className="text-[#9c4c35] bg-[#fdf3f0] px-2.5 py-1 rounded-md">
                      🌐 Supplemental information from the Clinical Tables API
                    </span>
                  )}
                  {lookupResult.type === 'inference' && (
                    <span className="text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-md flex items-center gap-1">
                      <Cpu className="w-3 h-3" /> Third-Priority Model Inference Fallback
                    </span>
                  )}
                  {lookupResult.message && (
                    <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded italic font-sans normal-case">
                      {lookupResult.message}
                    </span>
                  )}
                </div>

                {/* Database Result Content */}
                {lookupResult.type === 'database' && lookupResult.dbData && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-serif font-bold text-[#2a2a29]">
                        {lookupResult.dbData.name}
                      </h4>
                      <span className="text-[10px] font-mono font-bold bg-[#faf9f6] text-[#8a867c] px-2 py-0.5 rounded border border-[#e9e4d9]">
                        ID: {lookupResult.dbData.id}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-white p-3 rounded-lg border border-[#e9e4d9]">
                        <h5 className="text-[9px] font-bold uppercase tracking-wider text-[#6b665c] mb-1.5 font-mono">
                          Possible Cause
                        </h5>
                        <ul className="text-xs text-[#2a2a29] font-medium space-y-1">
                          {lookupResult.dbData.causes.map((c, i) => (
                            <li key={i} className="flex items-start gap-1">
                              <span className="text-[#5d6d4e] shrink-0">•</span>
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-[#e9e4d9]">
                        <h5 className="text-[9px] font-bold uppercase tracking-wider text-[#6b665c] mb-1.5 font-mono">
                          Care Advice
                        </h5>
                        <ul className="text-xs text-[#2a2a29] font-medium space-y-1">
                          {lookupResult.dbData.careAdvice.map((c, i) => (
                            <li key={i} className="flex items-start gap-1">
                              <span className="text-[#5d6d4e] shrink-0">•</span>
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-[#f2d6cd] bg-[#fdf3f0]">
                        <h5 className="text-[9px] font-bold uppercase tracking-wider text-[#9c4c35] mb-1.5 font-mono">
                          When to See a Doctor
                        </h5>
                        <ul className="text-xs text-[#9c4c35] font-semibold space-y-1">
                          {lookupResult.dbData.doctorTriggers.map((d, i) => (
                            <li key={i} className="flex items-start gap-1">
                              <span className="shrink-0">⚠️</span>
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* API Result Content */}
                {lookupResult.type === 'api' && lookupResult.apiData && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-serif font-bold text-[#2a2a29]">
                        {lookupResult.apiData.name}
                      </h4>
                      {lookupResult.apiData.icd10cm_code && (
                        <span className="text-[10px] font-mono font-bold bg-[#faf9f6]/90 text-[#8a867c] px-2 py-0.5 rounded border border-[#e9e4d9]">
                          ICD-10-CM: {lookupResult.apiData.icd10cm_code}
                        </span>
                      )}
                    </div>

                    {lookupResult.apiData.synonyms.length > 0 && (
                      <div className="bg-white p-3 rounded-lg border border-[#e9e4d9]">
                        <h5 className="text-[9px] font-bold uppercase tracking-wider text-[#6b665c] mb-1.5 font-mono">
                          Standardized Terminology Suggestions (Synonyms)
                        </h5>
                        <p className="text-xs italic text-[#5a564c] font-sans">
                          {lookupResult.apiData.synonyms.join(", ")}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Inference Fallback Result Content */}
                {lookupResult.type === 'inference' && lookupResult.inferenceData && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-serif font-bold text-[#2a2a29]">
                        {lookupResult.inferenceData.name} (Calculated Fallback)
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-white p-3 rounded-lg border border-[#e9e4d9]">
                        <h5 className="text-[9px] font-bold uppercase tracking-wider text-[#6b665c] mb-1.5 font-mono">
                          Algorithmic Primary Hypothesis
                        </h5>
                        <ul className="text-xs text-[#2a2a29] font-medium space-y-1">
                          {lookupResult.inferenceData.possibleCauses.map((c, i) => (
                            <li key={i} className="flex items-start gap-1">
                              <span className="text-[#5d6d4e] shrink-0">•</span>
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-[#e9e4d9]">
                        <h5 className="text-[9px] font-bold uppercase tracking-wider text-[#6b665c] mb-1.5 font-mono">
                          Calculated Care Recommendations
                        </h5>
                        <ul className="text-xs text-[#2a2a29] font-medium space-y-1">
                          {lookupResult.inferenceData.careRecommendations.map((c, i) => (
                            <li key={i} className="flex items-start gap-1">
                              <span className="text-[#5d6d4e] shrink-0">•</span>
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-yellow-200 bg-yellow-50/20">
                        <h5 className="text-[9px] font-bold uppercase tracking-wider text-yellow-800 mb-1.5 font-mono">
                          When to Seek Medical Attention
                        </h5>
                        <ul className="text-xs text-yellow-800 font-semibold space-y-1">
                          {lookupResult.inferenceData.whenToSeeDoctor.map((d, i) => (
                            <li key={i} className="flex items-start gap-1">
                              <span className="shrink-0">•</span>
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Safety Warning Block (Mandated) */}
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="leading-normal">
                    <strong>Reference Notice:</strong> This information is for educational purposes only and is not a medical diagnosis. Consult a qualified healthcare professional for medical advice.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unified Modifiable Symptoms Table Database */}
      <div className="bg-white rounded-2xl border border-[#e9e4d9] p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#faf9f6] pb-3.5 gap-3">
          <div className="space-y-0.5">
            <h3 className="text-[14px] font-bold text-[#3c3c3b] flex items-center gap-2">
              <Database className="w-4 h-4 text-[#5d6d4e]" />
              Database Grid Editor (Symptoms Table)
            </h3>
            <p className="text-xs text-[#8a867c]">
              Each row below represents a clinical symptom record inside the modifiable database ({dbSymptoms.length} rows)
            </p>
          </div>
          
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Separate toggle button */}
            <button
              type="button"
              id="toggle-grid-editor"
              onClick={() => setIsGridCollapsed(!isGridCollapsed)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 leading-none cursor-pointer border border-[#e2dfd5] bg-white hover:bg-[#faf9f6]"
            >
              {isGridCollapsed ? (
                <>
                  <ChevronDown className="w-4 h-4 text-[#5d6d4e]" />
                  <span>Expand Grid</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-4 h-4 text-[#5d6d4e]" />
                  <span>Collapse Grid</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleOpenAddWindow}
              className="text-[11px] font-bold bg-[#5d6d4e] hover:bg-[#455239] text-white px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-2xs cursor-pointer leading-none"
            >
              <Plus className="w-3.5 h-3.5" /> Add Symptom Row
            </button>
          </div>
        </div>

        {!isGridCollapsed && (
          /* Database Grid Table */
          <div className="overflow-x-auto border border-[#e9e4d9] rounded-xl shadow-2xs animate-none">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#faf9f6] text-[#6b665c] border-b border-[#e9e4d9] font-mono uppercase text-[10px] tracking-wider">
                <th className="p-3.5 font-bold">ID / Slug</th>
                <th className="p-3.5 font-bold">Display Name</th>
                <th className="p-3.5 font-bold">Causes</th>
                <th className="p-3.5 font-bold">Synonyms</th>
                <th className="p-3.5 font-bold text-center">Questions count</th>
                <th className="p-3.5 font-bold text-right">Row actions</th>
              </tr>
            </thead>
            <tbody>
              {dbSymptoms.map((sym) => (
                <tr 
                  key={sym.id} 
                  className="border-b border-[#faf9f6] hover:bg-[#faf9f6]/30 transition"
                >
                  <td className="p-3.5 font-mono text-[11px] font-bold text-[#5d6d4e] select-all">
                    {sym.id}
                  </td>
                  <td className="p-3.5 font-semibold text-[#2c2c2b]">
                    {sym.name}
                  </td>
                  <td className="p-3.5 text-slate-500 max-w-[180px] truncate leading-normal">
                    {sym.causes.join(', ') || <span className="text-slate-300 italic">none</span>}
                  </td>
                  <td className="p-3.5 text-slate-400 max-w-[140px] truncate">
                    {sym.synonyms.join(', ') || <span className="text-slate-300 italic">none</span>}
                  </td>
                  <td className="p-3.5 text-center font-bold text-[#6b665c]">
                    {sym.questions.length} checklist items
                  </td>
                  <td className="p-3.5 text-right whitespace-nowrap space-x-1">
                    <button
                      type="button"
                      title="Edit this Table Row"
                      onClick={() => handleOpenEditWindow(sym)}
                      className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100/80 text-amber-800 border border-amber-200 transition"
                    >
                      <Edit3 className="w-3.5 h-3.5 inline" />
                    </button>
                    <button
                      type="button"
                      title="Delete this Table Row"
                      onClick={() => handleDeleteRow(sym.id)}
                      className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100/80 text-red-800 border border-red-200 transition"
                    >
                      <Trash className="w-3.5 h-3.5 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Singular Consolidated Corresponding Input Window (Modal Dialog) */}
      {isInputWindowOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-none">
          <div className="bg-white rounded-2xl border border-[#e9e4d9] max-w-2xl w-full max-h-[90vh] flex flex-col shadow-xl overflow-hidden animate-none">
            
            {/* Modal Title Bar */}
            <div className="bg-[#faf9f6] border-b border-[#e9e4d9] p-4.5 flex items-center justify-between">
              <div className="space-y-0.5">
                <h4 className="font-serif font-bold text-sm text-[#3c3c3b]">
                  {editingSymptomId ? `Database Input: Modify Row [ ${editingSymptomId} ]` : "Database Input: Insert New Symptom Row"}
                </h4>
                <p className="text-[11px] text-[#8a867c] leading-none">
                  Assign columns of the Symptoms and Questions tables directly
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsInputWindowOpen(false)}
                className="text-[#8a867c] hover:text-[#3c3c3b] p-1 rounded-lg hover:bg-[#f1f0ea]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content - Scrollable Simple Columns Form */}
            <form onSubmit={handleSaveInputWindow} className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#6b665c] uppercase block">
                    Symptom ID Code (slug_format)
                  </label>
                  <input
                    type="text"
                    required
                    disabled={editingSymptomId !== null}
                    value={formFields.id}
                    onChange={(e) => setFormFields(prev => ({ ...prev, id: e.target.value }))}
                    placeholder="e.g. chronic_fatigue"
                    className="w-full bg-white border border-[#e2dfd5] rounded-xl px-3.5 py-2 text-xs focus:ring-1 focus:ring-[#5d6d4e] focus:outline-none disabled:bg-[#f1f0ea] disabled:text-[#8a867c] font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#6b665c] uppercase block">
                    Display Name (Title)
                  </label>
                  <input
                    type="text"
                    required
                    value={formFields.name}
                    onChange={(e) => setFormFields(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Chronic Fatigue"
                    className="w-full bg-white border border-[#e2dfd5] rounded-xl px-3.5 py-2 text-xs focus:ring-1 focus:ring-[#5d6d4e] focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#6b665c] uppercase block">
                  Search Synonyms (comma separated)
                </label>
                <input
                  type="text"
                  value={formFields.synonyms}
                  onChange={(e) => setFormFields(prev => ({ ...prev, synonyms: e.target.value }))}
                  placeholder="tiredness, weakness, exhaustion, lethargy"
                  className="w-full bg-white border border-[#e2dfd5] rounded-xl px-3.5 py-2.2 text-xs focus:ring-1 focus:ring-[#5d6d4e] focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#6b665c] uppercase block">
                  Possible Core Causes (one cause per line)
                </label>
                <textarea
                  rows={2}
                  value={formFields.causes}
                  onChange={(e) => setFormFields(prev => ({ ...prev, causes: e.target.value }))}
                  placeholder="Stress and mental fatigue&#10;Inadequate sleep quality&#10;Thyroid insufficiency"
                  className="w-full bg-white border border-[#e2dfd5] rounded-xl px-3.5 py-2 text-xs focus:ring-1 focus:ring-[#5d6d4e] focus:outline-none custom-scrollbar"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#6b665c] uppercase block">
                    Care Guidance / Remedial Steps (one per line)
                  </label>
                  <textarea
                    rows={3}
                    value={formFields.careAdvice}
                    onChange={(e) => setFormFields(prev => ({ ...prev, careAdvice: e.target.value }))}
                    placeholder="Aim for 8 hours of sleep&#10;Practice gentle relaxation"
                    className="w-full bg-white border border-[#e2dfd5] rounded-xl px-3.5 py-2 text-xs focus:ring-1 focus:ring-[#5d6d4e] focus:outline-none custom-scrollbar"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#6b665c] uppercase block">
                    See a Doctor Red Flags (one per line)
                  </label>
                  <textarea
                    rows={3}
                    value={formFields.doctorTriggers}
                    onChange={(e) => setFormFields(prev => ({ ...prev, doctorTriggers: e.target.value }))}
                    placeholder="Accompanied by sudden chest pain&#10;Persists longer than 4 weeks"
                    className="w-full bg-white border border-[#e2dfd5] rounded-xl px-3.5 py-2 text-xs focus:ring-1 focus:ring-[#5d6d4e] focus:outline-none custom-scrollbar"
                  />
                </div>
              </div>

              <div className="space-y-1 pt-1 border-t border-[#faf9f6]">
                <label className="text-[10px] font-bold text-[#5d6d4e] uppercase block flex items-center gap-1">
                  Checklist Diagnostic Questions (one query per line)
                </label>
                <p className="text-[11px] text-[#8a867c] leading-relaxed mb-1.5">
                  Type each diagnostic question on its own line. Questions about <strong>temperature</strong> (using °C/°F) or <strong>duration</strong> (in hours, days, or weeks) automatically map to advanced range slider metrics!
                </p>
                <textarea
                  rows={3}
                  value={formFields.questions}
                  onChange={(e) => setFormFields(prev => ({ ...prev, questions: e.target.value }))}
                  placeholder="What is your measured body temperature?&#10;How many days has the fatigue lasted?&#10;Are you experiencing unexplained sudden weight loss?"
                  className="w-full bg-white border border-[#e2dfd5] rounded-xl px-3.5 py-2 text-xs focus:ring-1 focus:ring-[#5d6d4e] focus:outline-none font-sans custom-scrollbar"
                />
              </div>

              {/* Action Buttons in footer of Input Form */}
              <div className="flex justify-end gap-2.5 pt-3.5 border-t border-[#e9e4d9]">
                <button
                  type="button"
                  onClick={() => setIsInputWindowOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#faf9f6] text-[#6b665c] border border-[#e2dfd5] hover:bg-[#f1f0ea] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#5d6d4e] hover:bg-[#455239] text-white shadow-xs transition cursor-pointer"
                >
                  Save Local Row
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
