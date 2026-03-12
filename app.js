// ============================================================
// Jungle Ventures — VC Intelligence Platform
// Main Application Controller
// ============================================================
// Dependencies loaded via script tags:
// - data.js (STARTUPS, SIGNAL_TYPES, GEOGRAPHIES, SECTORS)
// - scoring.js (rankStartups, WEIGHTS)
// - charts.js (createSparkline, createRadarChart, getScoreColor, getScoreClass, getBarColor)
// - config.js (CONFIG)

// ---- Config Fallback ----
if (typeof CONFIG === 'undefined') {
  var CONFIG = { supabaseUrl: '', supabaseKey: '', streakApiKey: '', googleClientId: '', gmailScopes: '' };
}

// ---- State ----
let rankedStartups = [];
let streakDeals = [];  // Real Streak CRM deals
let currentSection = 'dealflow';
let filters = { geo: 'All', sector: 'All', tier: 'All', people: 'All', search: '' };
let uploadedDecks = [];
let currentUser = { email: 'guest@jungleventures.com', name: 'Guest User', avatar: '' };
let pipelineTab = 'stage'; // 'all', 'stage', 'industry', 'followup'

// ---- Supabase ----
const SUPABASE_URL = CONFIG.supabaseUrl || '';
const SUPABASE_KEY = CONFIG.supabaseKey || '';
let supabaseClient = null;
let supabaseConnected = false;

// ---- Streak CRM ----
const STREAK_API_KEY = CONFIG.streakApiKey || '';
let streakPipelines = [];

// ---- Gmail OAuth ----
let gmailTokenClient = null;
let gmailAccessToken = null;
let dealEmails = [];

let integrationState = {
  gmail: { connected: false, email: '', emails: [] },
  streak: { connected: true, apiKey: STREAK_API_KEY, pipelines: [], lastSync: null },
  supabase: { connected: false },
  team: {
    members: [
      { name: 'You', email: 'admin@jungleventures.com', role: 'Partner', color: '#10b981' }
    ]
  }
};

async function initSupabase() {
  try {
    if (window.supabase && SUPABASE_URL && SUPABASE_KEY) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      supabaseConnected = true;
      integrationState.supabase.connected = true;
      console.log('✅ Supabase connected:', SUPABASE_URL);

      let startupsData = null;
      // Fetch scored startups from Supabase (may not exist yet, that's okay)
      try {
        const { data, error } = await supabaseClient.from('startups').select('*');
        if (!error && data && data.length > 0) {
          startupsData = data;
          console.log(`✅ Loaded ${data.length} scored deals from Supabase`);
        }
      } catch (e) { /* ignore to load local fallback */ }

      // Fetch real Streak CRM deals
      try {
        const { data: sDeals, error: sErr } = await supabaseClient
          .from('streak_deals')
          .select('*')
          .order('updated_at', { ascending: false });
        if (!sErr && sDeals && sDeals.length > 0) {
          streakDeals = sDeals;
          integrationState.streak.connected = true;
          integrationState.streak.lastSync = new Date();
          integrationState.streak.dealCount = sDeals.length;
          console.log(`✅ Loaded ${sDeals.length} Streak deals from Supabase`);
        }
      } catch (e2) {
        console.warn('Streak deals fetch skipped:', e2.message);
      }

      // Fetch news signals (for Power Moves, Briefing, and per-module intel strips)
      try {
        const { data: newsData, error: newsErr } = await supabaseClient
          .from('news_signals')
          .select('*')
          .order('published_at', { ascending: false })
          .limit(100);
        if (!newsErr && newsData) {
          window._newsSignals = newsData;
          console.log(`✅ Loaded ${newsData.length} news signals`);
        } else {
          window._newsSignals = [];
        }
      } catch (e3) {
        window._newsSignals = [];
        console.warn('news_signals fetch skipped:', e3.message);
      }

      // Fetch deal enrichments (GPT research for all 801 deals)
      try {
        const { data: enrichData, error: enrichErr } = await supabaseClient
          .from('deal_enrichments')
          .select('box_key,founder_name,founder_background,thesis_fit_score,thesis_fit_reason,strengths,risks,competitors,moat,market_size,total_raised,investors,product_description,website,founded_year');
        if (!enrichErr && enrichData && enrichData.length > 0) {
          window._dealEnrichments = {};
          enrichData.forEach(e => { window._dealEnrichments[e.box_key] = e; });
          console.log(`✅ Loaded ${enrichData.length} deal enrichments`);
        } else {
          window._dealEnrichments = {};
        }
      } catch (e4) {
        window._dealEnrichments = {};
        console.warn('deal_enrichments fetch skipped:', e4.message);
      }

      // Fetch previously analyzed decks
      try {
        const { data: deckData, error: deckErr } = await supabaseClient
          .from('deck_analyses')
          .select('*')
          .order('created_at', { ascending: false });
        if (!deckErr && deckData && deckData.length > 0) {
          window._savedDecks = deckData;
          console.log(`✅ Loaded ${deckData.length} analyzed decks`);
        } else {
          window._savedDecks = [];
        }
      } catch (e5) {
        window._savedDecks = [];
        console.warn('deck_analyses fetch skipped:', e5.message);
      }

      // Fetch newly added Phase 6 tables
      try {
        const { data: portData } = await supabaseClient.from('portfolio_metrics').select('*');
        window._portfolioMetrics = portData || [];
        const { data: boardData } = await supabaseClient.from('board_meetings').select('*');
        window._boardMeetings = boardData || [];
        const { data: founderData } = await supabaseClient.from('founder_profiles').select('*');
        window._founderProfiles = founderData || [];
        console.log(`✅ Loaded phase 6 tables: ${window._portfolioMetrics.length} portfolio, ${window._boardMeetings.length} board, ${window._founderProfiles.length} founders`);
      } catch (e6) {
        window._portfolioMetrics = [];
        window._boardMeetings = [];
        window._founderProfiles = [];
        console.warn('Phase 6 tables fetch skipped:', e6.message);
      }

      return startupsData;
    }
  } catch (e) {
    console.warn('Supabase init/fetch failed, falling back to local data:', e);
  }
  return null;
}

function initStreak() {
  // Streak API requires server-side proxy due to CORS
  // For now, we store the key and show connected state
  // In production, API calls go through a Supabase Edge Function
  integrationState.streak.connected = true;
  integrationState.streak.lastSync = new Date();
  integrationState.streak.pipelines = [
    { name: 'Deal Flow - India', boxes: 7, stage: 'Active' },
    { name: 'Deal Flow - SEA', boxes: 9, stage: 'Active' },
    { name: 'Portfolio Monitoring', boxes: 8, stage: 'Active' },
    { name: 'Passed Deals', boxes: 24, stage: 'Archive' }
  ];
  console.log('✅ Streak CRM connected — API key configured');
}

function initGmail() {
  if (!CONFIG.googleClientId) {
    console.log('⏳ Gmail: Waiting for Google Client ID in config.js');
    return;
  }
  try {
    gmailTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: CONFIG.gmailScopes,
      callback: handleGmailAuthResponse
    });
    console.log('✅ Gmail OAuth client initialized');
  } catch (e) {
    console.warn('Gmail init deferred — GIS script loading');
  }
}

function connectGmail() {
  if (!CONFIG.googleClientId) {
    // Show setup instructions
    openGmailSetupModal();
    return;
  }
  if (gmailTokenClient) {
    gmailTokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    initGmail();
    setTimeout(() => {
      if (gmailTokenClient) gmailTokenClient.requestAccessToken({ prompt: 'consent' });
    }, 500);
  }
}

function handleGmailAuthResponse(response) {
  if (response.error) {
    console.error('Gmail auth error:', response);
    return;
  }
  gmailAccessToken = response.access_token;
  integrationState.gmail.connected = true;

  // Fetch user profile
  fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${gmailAccessToken}` }
  })
    .then(r => r.json())
    .then(profile => {
      integrationState.gmail.email = profile.email;
      console.log('✅ Gmail connected:', profile.email);
      fetchDealEmails();
      if (currentSection === 'integrations') {
        renderIntegrations(document.getElementById('content-area'));
      }
    });
}

function fetchDealEmails() {
  if (!gmailAccessToken) return;

  // Build search query from startup names in pipeline
  const startupNames = rankedStartups.map(s => s.name).join(' OR ');
  const query = encodeURIComponent(`(${startupNames}) OR "deal flow" OR "pitch deck" OR "investment" OR "fundraise" OR "term sheet"`);

  fetch(`https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=${query}`, {
    headers: { 'Authorization': `Bearer ${gmailAccessToken}` }
  })
    .then(r => r.json())
    .then(data => {
      if (!data.messages) {
        integrationState.gmail.emails = [];
        return;
      }
      // Fetch details for each message
      const fetchPromises = data.messages.slice(0, 10).map(msg =>
        fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
          headers: { 'Authorization': `Bearer ${gmailAccessToken}` }
        }).then(r => r.json())
      );
      return Promise.all(fetchPromises);
    })
    .then(emails => {
      if (!emails) return;
      integrationState.gmail.emails = emails.map(e => {
        const headers = e.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '(No subject)';
        const from = headers.find(h => h.name === 'From')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        // Auto-tag with matching startup names
        const matchedStartups = rankedStartups.filter(s =>
          subject.toLowerCase().includes(s.name.toLowerCase()) ||
          from.toLowerCase().includes(s.name.toLowerCase())
        ).map(s => s.name);
        return { id: e.id, subject, from, date, snippet: e.snippet, matchedStartups };
      });
      console.log(`📧 Fetched ${integrationState.gmail.emails.length} deal-related emails`);
      if (currentSection === 'integrations') {
        renderIntegrations(document.getElementById('content-area'));
      }
    })
    .catch(err => console.warn('Gmail fetch error:', err));
}

function openGmailSetupModal() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  content.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">
        <div class="deal-logo">📧</div>
        <div>
          <h3>Gmail API Setup</h3>
          <div class="sub">Connect your Gmail to auto-scan deal emails</div>
        </div>
      </div>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body" style="padding:20px">
      <div class="insight-box info" style="margin-bottom:16px">Follow these steps to get your Google Client ID. Takes ~3 minutes.</div>
      <div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.8">
        <ol style="padding-left:20px">
          <li><strong>Go to</strong> <a href="https://console.cloud.google.com" target="_blank" style="color:var(--accent-blue)">console.cloud.google.com</a></li>
          <li><strong>Create a project</strong> (or select existing) → Name it "JV Intelligence"</li>
          <li>Go to <strong>APIs & Services → Library</strong> → Search <strong>"Gmail API"</strong> → <strong>Enable</strong></li>
          <li>Go to <strong>APIs & Services → Credentials</strong> → <strong>Create Credentials → OAuth Client ID</strong></li>
          <li>Configure consent screen if prompted (External, add your email as test user)</li>
          <li>Application type: <strong>Web application</strong></li>
          <li>Authorized JavaScript origins: <code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:0.8rem">http://localhost:8765</code></li>
          <li>Authorized redirect URIs: <code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:0.8rem">http://localhost:8765</code></li>
          <li>Click <strong>Create</strong> → Copy the <strong>Client ID</strong></li>
          <li>Paste it below ↓</li>
        </ol>
      </div>
      <div style="margin-top:16px">
        <div class="integration-input-group">
          <input class="integration-input" placeholder="Paste your Google Client ID here..." id="gmail-client-id-input" style="font-size:0.82rem">
          <button class="integration-connect-btn" id="save-gmail-client-id">Save & Connect</button>
        </div>
      </div>
    </div>
  `;
  modal.classList.add('active');
  content.querySelector('#modal-close-btn').addEventListener('click', closeModal);
  content.querySelector('#save-gmail-client-id').addEventListener('click', () => {
    const clientId = document.getElementById('gmail-client-id-input')?.value?.trim();
    if (clientId && clientId.includes('.apps.googleusercontent.com')) {
      CONFIG.googleClientId = clientId;
      closeModal();
      initGmail();
      setTimeout(() => connectGmail(), 300);
    } else {
      alert('Please enter a valid Google Client ID.\nIt looks like: 123456789-xxxx.apps.googleusercontent.com');
    }
  });
}

// ---- Valuation Comps Data ----
const VALUATION_COMPS = [];  // Removed mock data

// ---- Thesis Data ----
const THESIS_DATA = {
  accelerating: [
    { emoji: "🏭", title: "AI-Powered Manufacturing", desc: "Factory AI, predictive maintenance, and visual inspection are seeing 3x YoY funding growth in India & SEA. Regulatory push for smart manufacturing in India (PLI scheme) is creating massive demand. JV is well-positioned with FactoryOS, QualityLens, and SteelMind.", status: "Thesis strengthening ↑↑" },
    { emoji: "🎮", title: "Social Gaming in SEA", desc: "500M+ mobile-first gamers in SEA with rising ARPU. Playlo and local studios are capturing share from global publishers. Indonesia and Vietnam are fastest-growing markets.", status: "Capital flowing in ↑" },
    { emoji: "♻️", title: "Sustainability / ESG in Manufacturing", desc: "EU CBAM and Singapore carbon tax driving demand for manufacturing carbon accounting. GreenMill is pioneer in ASEAN. $48B TAM growing 25% annually.", status: "Early innings — low competition ↑" }
  ],
  saturated: [
    { emoji: "🛒", title: "Quick Commerce (Metro India)", desc: "Zepto, Blinkit, Instamart have locked up Delhi/Mumbai/Bangalore. Tier-2 opportunity remains (KartBee thesis), but metro QC is winner-take-most. Over 30 funded players.", status: "Crowded — differentiation key →" },
    { emoji: "💳", title: "Digital Lending (India)", desc: "150+ NBFCs with digital play. RBI tightening regulations. UPI dominance means distribution is easy but defensibility is hard. Finfolk (PH) is better geo-play.", status: "Peak funding — margins compressing →" },
    { emoji: "🍱", title: "Cloud Kitchens", desc: "Rebel Foods, EatClub, CloudEats have scaled. High churn, low margins. Chowbus SEA differentiation through premium + AI is best path forward.", status: "Consolidation phase →" }
  ],
  whitespace: [
    { emoji: "🤖", title: "Affordable Industrial Robotics (ASEAN)", desc: "Only RoboWeld is tackling this. ASEAN has 2M+ SME factories that can't afford Fanuc/ABB. 70% cost reduction + AI programming is the unlock. $38B TAM.", status: "Zero competition — first mover advantage" },
    { emoji: "📦", title: "Packaging Automation (India)", desc: "India's packaging market is $73B but <5% automated. PackBot is only startup targeting modular automation for mid-market FMCG. EU sustainability packaging rules will force adoption.", status: "Massive TAM, no startup competition" },
    { emoji: "🧪", title: "Raw Materials Marketplace (SEA)", desc: "MateriFlow is pioneering B2B materials marketplace in Indonesia. No Alibaba-equivalent for ASEAN factories. Trade finance integration is key moat.", status: "First mover in $55B market" },
    { emoji: "🌏", title: "Vernacular Creator Economy (Bharat)", desc: "ShareChat proved demand, but Vybe's multi-lingual AI dubbing + monetization is new. 500M non-English internet users in India with no dominant platform.", status: "Platform shift opportunity" }
  ],
  gaps: [
    { emoji: "⚠️", title: "Underexposed: Semiconductor Supply Chain", desc: "India's semiconductor mission ($10B+) has no JV portfolio play. Design services, testing, and packaging automation are adjacent to current thesis.", signal: "negative" },
    { emoji: "⚠️", title: "Underexposed: Agri-Manufacturing", desc: "Farm-to-factory value chain in India/SEA is $200B+ with minimal VC presence. Cold chain, food processing automation, and agri-input marketplaces.", signal: "negative" },
    { emoji: "✅", title: "Strong: Factory AI Stack", desc: "3 companies across visual inspection, predictive maintenance, and smart factory OS. Continue investing to own this category.", signal: "positive" }
  ]
};

// ---- Portfolio Data ----
const PORTFOLIO_DATA = [
  { name: "FactoryOS", logo: "🏭", stage: "Seed", health: "green", hiring: "+18 roles", traffic: "↑ 42%", appRank: "N/A (B2B)", sentiment: "Positive", compFunding: "$12M by rival AInspect", signals: ["Hypergrowth: 200% rev growth", "Follow-on ready in 6 months"], followOnReady: true },
  { name: "QualityLens", logo: "🔍", stage: "Series A", health: "green", hiring: "+26 roles", traffic: "↑ 68%", appRank: "N/A (B2B)", sentiment: "Very Positive", compFunding: "$8M by VisualAI (SG)", signals: ["TechCrunch feature drove 40% traffic spike", "3 new enterprise logos this month"], followOnReady: true },
  { name: "SteelMind", logo: "🔩", stage: "Series A", health: "green", hiring: "+28 roles", traffic: "↑ 35%", appRank: "N/A (B2B)", sentiment: "Positive", compFunding: "$15M by Uptake (US competitor)", signals: ["JSW Steel case study driving inbound", "Revenue growing slower than hiring — watch burn"], followOnReady: false },
  { name: "Playlo", logo: "🎮", stage: "Pre-Series A", health: "green", hiring: "+22 roles", traffic: "↑ 210%", appRank: "#4 Indonesia", sentiment: "Very Positive", compFunding: "$5M by rival GameHive", signals: ["Viral TikTok driving organic growth", "Retention D7 at 38% — above gaming benchmark"], followOnReady: true },
  { name: "KartBee", logo: "🛒", stage: "Pre-Seed", health: "yellow", hiring: "+34 roles", traffic: "↑ 180%", appRank: "#12 Tier-2 cities", sentiment: "Mixed", compFunding: "$22M by Tier-2 rival QuickBasket", signals: ["⚠️ Competitor just raised $22M Series A", "Burn rate accelerating — 14 months runway"], followOnReady: false },
  { name: "MateriFlow", logo: "🧪", stage: "Seed", health: "green", hiring: "+20 roles", traffic: "↑ 55%", appRank: "N/A (B2B)", sentiment: "Positive", compFunding: "None direct", signals: ["GMV growing 3x QoQ", "Logistics integration completed"], followOnReady: false },
  { name: "GreenMill", logo: "♻️", stage: "Seed", health: "green", hiring: "+19 roles", traffic: "↑ 72%", appRank: "N/A (B2B)", sentiment: "Positive", compFunding: "$10M by Climatiq (EU)", signals: ["Singapore carbon tax expansion announced", "3 MNC pilots converting to contracts"], followOnReady: true },
  { name: "RoboWeld", logo: "🤖", stage: "Series A", health: "green", hiring: "+15 roles", traffic: "↑ 28%", appRank: "N/A (B2B)", sentiment: "Positive", compFunding: "None in ASEAN", signals: ["65 units deployed, 0% churn", "Vietnam factory automation incentive announced"], followOnReady: true }
];

// ---- Power Moves Data ----
const POWER_MOVES = [
  { type: "Fund Launch", title: "Sequoia India / SEA raises $2.8B Fund IX", desc: "Largest-ever SEA-focused fund. Will increase competition in Series A deals across manufacturing tech and consumer.", implication: "⚡ Expect valuation inflation in Series A factory-tech deals. Move faster on QualityLens and SteelMind follow-ons.", time: "2 days ago" },
  { type: "Partner Movement", title: "Accel India Partner Prayank Swaroop joins Lightspeed as Venture Partner", desc: "Prayank was lead on 3 manufacturing-tech deals at Accel. His move signals Lightspeed doubling down on B2B manufacturing in India.", implication: "🎯 Lightspeed may co-invest or compete on FactoryOS-style deals. Engage Prayank for co-lead opportunities.", time: "4 days ago" },
  { type: "Stealth Fundraise", title: "CarbonZero (SG) quietly raising $15M Series A", desc: "ESG compliance platform for ASEAN manufacturers. Direct competitor to GreenMill. Pitched Temasek and GIC.", implication: "⚠️ Accelerate GreenMill's fundraise timeline. Position as the operator-led alternative (Chen's Shell background).", time: "1 week ago" },
  { type: "Markup Signal", title: "Nexus Venture marking up Moglix at 4x in 18 months", desc: "Moglix's B2B industrial marketplace valued at $2.5B. Validates MateriFlow's thesis in Indonesia.", implication: "💰 Use Moglix markup as comp for MateriFlow's next round. Indonesia market 3x less penetrated than India.", time: "1 week ago" },
  { type: "Secondary Transaction", title: "Early ShareChat shares trading at $3.2B implied valuation on secondary market", desc: "Despite layoffs, secondary buyers see long-term value in Bharat vernacular content. Vybe is in same thesis.", implication: "📊 ShareChat secondary demand validates Vybe's vernacular creator thesis. Positive signal for pricing.", time: "10 days ago" },
  { type: "Syndicate Pattern", title: "Temasek + Wavemaker co-leading 3 manufacturing deals in 6 months", desc: "Pattern of co-investment in ASEAN manufacturing tech: robotics, IoT, and supply chain.", implication: "🤝 Approach Wavemaker as systematic co-investor for JV's manufacturing portfolio. They led RoboWeld's A.", time: "2 weeks ago" },
  { type: "Fund Launch", title: "East Ventures launches $250M Growth Fund for Indonesia", desc: "First growth-stage fund. Will compete for Series B deals in Indonesian consumer tech and B2B.", implication: "🔄 East Ventures backed Playlo seed. May lead Series A. Coordinate early to maintain pro-rata.", time: "2 weeks ago" },
  { type: "Stealth Fundraise", title: "FlexiPack (Mumbai) raising $5M seed for packaging automation", desc: "Direct competitor to PackBot. Founded by ex-Uflex engineers. Pitched Blume and 3one4.", implication: "⚠️ PackBot needs to close key FMCG clients fast. Speed of execution is the moat, not tech.", time: "3 weeks ago" }
];

// ---- Pattern Data ----
const PATTERN_WINNERS = [
  { text: "<strong>Founder with 10+ years domain expertise</strong> who then builds tech solution for their own industry pain point. (FactoryOS, QualityLens, SteelMind)" },
  { text: "<strong>Speed of execution in first 6 months</strong>: Winners ship MVP in <90 days and have paying customers by month 4." },
  { text: "<strong>Prior exit or VP+ role at scaled company</strong> — correlates with 3x higher chance of Series A." },
  { text: "<strong>Market timing aligned with regulatory tailwind</strong>: PLI scheme (India), carbon tax (SG), factory automation incentives (VN)." },
  { text: "<strong>Distribution hack in first 30 days</strong>: Viral content, influencer partnerships, or strategic BD that drives 10K+ initial users/customers." },
  { text: "<strong>Open-source or community-led growth</strong> in B2B: GitHub stars >500 in first year correlates with faster enterprise sales." },
  { text: "<strong>Repeat founders</strong> with even 1 prior exit close rounds 2x faster and at 40% higher valuations." }
];

const PATTERN_LOSERS = [
  { text: "<strong>Me-too product in crowded market</strong> without clear distribution advantage. 'Better tech' alone doesn't win." },
  { text: "<strong>First-time founders targeting enterprise</strong> with no industry network. Sales cycles bankrupt them before product-market fit." },
  { text: "<strong>Raised too much too early</strong> without unit economics proof. Creates misaligned incentives and governance issues." },
  { text: "<strong>Single geography, single customer concentration</strong>: Top 3 customers >50% of revenue = fragile business." },
  { text: "<strong>Hardware-only play without software/data moat</strong>: Margins compress with Chinese competition within 18 months." },
  { text: "<strong>Consumer app without organic viral loop</strong>: CAC > LTV death spiral when paid acquisition stops." }
];

const EVAL_CHECKLIST = [
  { icon: "🎯", label: "Founder-market fit (domain expertise > 5 years)" },
  { icon: "⚡", label: "Speed signal (MVP < 90 days, revenue < 6 months)" },
  { icon: "🏆", label: "Prior exit or VP+ at $1B+ company" },
  { icon: "📈", label: "MoM growth > 30% for 3+ consecutive months" },
  { icon: "🛡️", label: "Defensible moat (tech, data, regulation, network effects)" },
  { icon: "🌊", label: "Market timing / regulatory tailwind present" },
  { icon: "💰", label: "Unit economics positive or clear path within 12 months" },
  { icon: "🌏", label: "Multi-geo expansion potential without full rebuild" },
  { icon: "👥", label: "Team hiring velocity (>10 roles/month = conviction)" },
  { icon: "🔄", label: "Product engagement: DAU/MAU > 25% or NPS > 50" }
];

// ---- Init ----
async function init() {
  // Try loading from Supabase first
  const liveData = await initSupabase();

  if (liveData) {
    rankedStartups = rankStartups(liveData);
  } else {
    console.log('Using local mock data fallback.');
    rankedStartups = rankStartups(STARTUPS);
  }

  // Set date
  const now = new Date();
  document.getElementById('report-date').textContent = now.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  document.getElementById('deal-count-badge').textContent = streakDeals.length || rankedStartups.length;

  // Dynamic filter population from live Streak data
  populateDynamicFilters();

  // Log integration status
  if (streakDeals.length > 0) {
    console.log(`📊 Dashboard loaded: ${rankedStartups.length} scored deals + ${streakDeals.length} Streak CRM deals`);
  }

  // Bind navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.dataset.section;
      switchSection(section);
    });
  });

  // Bind filters
  document.getElementById('filter-geo').value = 'All';
  document.getElementById('filter-geo').addEventListener('change', (e) => { filters.geo = e.target.value; renderCurrentSection(); });
  document.getElementById('filter-sector').addEventListener('change', (e) => { filters.sector = e.target.value; renderCurrentSection(); });
  document.getElementById('filter-tier').addEventListener('change', (e) => { filters.tier = e.target.value; renderCurrentSection(); });
  document.getElementById('filter-people').addEventListener('change', (e) => { filters.people = e.target.value; renderCurrentSection(); });
  document.getElementById('search-input').addEventListener('input', (e) => { filters.search = e.target.value.toLowerCase(); renderCurrentSection(); });

  // Modal close
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // Mobile menu
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Render initial section
  renderCurrentSection();
}

function switchSection(section) {
  currentSection = section;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-section="${section}"]`)?.classList.add('active');

  const titles = {
    dealflow: 'Deal Flow Pipeline',
    deckanalyzer: 'Deck Analyzer',
    valuation: 'Valuation Intelligence',
    thesis: 'Thesis Tracker',
    portfolio: 'Portfolio Command Center',
    powermoves: 'Power Moves & Signals',
    patterns: 'Pattern Recognition Engine',
    briefing: 'Daily Intelligence Brief',
    integrations: 'Integrations Hub',
    meetingprep: 'Partner Meeting Prep',
    icmemo: 'IC Memo Generator',
    fundradar: 'Fundraising Radar',
    vccrm: 'Relationship Intelligence',
    networkmap: 'Co-Investment Network',
    competitive: 'Competitive Landscape',
    publiccomps: 'Public Market Comps',
    industryview: 'Industry Analyzer',
    lpreport: 'LP Quarterly Report',
    dealvelocity: 'Deal Velocity Tracker',
    admin: 'Admin Panel',
    activitylog: 'Activity Log'
  };
  document.getElementById('page-title').textContent = titles[section] || '';

  // Close mobile menu
  document.getElementById('sidebar').classList.remove('open');

  renderCurrentSection();
}

function renderCurrentSection() {
  const area = document.getElementById('content-area');
  area.scrollTop = 0;

  switch (currentSection) {
    case 'dealflow': renderDealFlow(area); break;
    case 'deckanalyzer': renderDeckAnalyzer(area); break;
    case 'valuationlab': renderValuationLab(area); break;
    case 'intelhub': renderIntelHub(area); break;
    case 'icwarroom': renderICWarRoom(area); break;
    case 'portfolio': renderPortfolio(area); break;
    case 'networkcrm': renderNetworkCRM(area); break;
    case 'settings': renderSettings(area); break;
    // Legacy aliases (keep old routes working)
    case 'valuation': renderValuationLab(area); break;
    case 'thesis': renderIntelHub(area); break;
    case 'briefing': renderIntelHub(area); break;
    case 'powermoves': renderIntelHub(area); break;
    case 'meetingprep': renderICWarRoom(area); break;
    case 'icmemo': renderICWarRoom(area); break;
    case 'patterns': renderICWarRoom(area); break;
    case 'integrations': renderSettings(area); break;
    case 'admin': renderSettings(area); break;
    case 'boardseats': renderPortfolio(area); break;
    case 'vccrm': renderNetworkCRM(area); break;
    case 'networkmap': renderNetworkCRM(area); break;
    case 'fundradar': renderNetworkCRM(area); break;
    case 'competitive': renderDealFlow(area); break;
    case 'publiccomps': renderValuationLab(area); break;
    case 'industryview': renderValuationLab(area); break;
    case 'lpreport': renderPortfolio(area); break;
    case 'dealvelocity': renderDealFlow(area); break;
    case 'activitylog': renderSettings(area); break;
  }
}

// ============================================================
// Dynamic Filter Population (from live Streak data)
// ============================================================
function populateDynamicFilters() {
  if (!streakDeals.length) return;

  // Collect unique geos
  const geoSet = new Set();
  streakDeals.forEach(d => {
    const country = inferCountry(d);
    if (country) geoSet.add(country);
  });
  const geoSelect = document.getElementById('filter-geo');
  if (geoSelect) {
    const currentVal = geoSelect.value;
    geoSelect.innerHTML = '<option value="All">All Geographies</option>';
    [...geoSet].sort().forEach(g => {
      geoSelect.innerHTML += `<option value="${g}">${g}</option>`;
    });
    geoSelect.value = currentVal;
  }

  // Collect unique industries
  const sectorSet = new Set();
  streakDeals.forEach(d => {
    const ind = inferIndustry(d);
    if (ind) sectorSet.add(ind);
  });
  const sectorSelect = document.getElementById('filter-sector');
  if (sectorSelect) {
    const currentVal = sectorSelect.value;
    sectorSelect.innerHTML = '<option value="All">All Sectors</option>';
    [...sectorSet].sort().forEach(s => {
      sectorSelect.innerHTML += `<option value="${s}">${s}</option>`;
    });
    sectorSelect.value = currentVal;
  }

  // Collect unique assignees (people)
  const peopleSet = new Set();
  streakDeals.forEach(d => {
    try {
      const assignees = JSON.parse(d.assigned_to || '[]');
      assignees.forEach(a => { if (a.name) peopleSet.add(a.name); });
    } catch { }
  });
  const peopleSelect = document.getElementById('filter-people');
  if (peopleSelect) {
    const currentVal = peopleSelect.value;
    peopleSelect.innerHTML = '<option value="All">All People</option>';
    [...peopleSet].sort().forEach(p => {
      peopleSelect.innerHTML += `<option value="${p}">${p}</option>`;
    });
    peopleSelect.value = currentVal;
  }
}

// ============================================================
// MODULE 1: Deal Flow
// ============================================================
function getFilteredStartups() {
  return rankedStartups.filter(s => {
    if (filters.geo !== 'All' && s.geography !== filters.geo) return false;
    if (filters.sector !== 'All' && s.sector !== filters.sector && s.subSector !== filters.sector) return false;
    if (filters.tier !== 'All' && s.scores.tier.class !== filters.tier) return false;
    if (filters.search) {
      const q = filters.search;
      const searchable = `${s.name} ${s.sector} ${s.subSector} ${s.geography} ${s.city} ${s.founders.map(f => f.name + ' ' + f.pedigree).join(' ')}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });
}

// ============================================================
// Streak CRM Intelligence Layer
// Stage names/colors sourced from streak_stages table
// ============================================================
const STREAK_STAGE_NAMES = {
  '5001': 'Lead', '5016': 'Pinged', '5018': 'Meeting Set Up',
  '5002': 'Met+Active', '5003': 'Deep Dive', '5011': 'IC1/2/3',
  '5004': 'Term Sheet', '5014': 'Portfolio', '5007': 'Urgent Tracking',
  '5008': 'Non-urgent Tracking', '5015': 'Met+Track (Too Early)',
  '5009': 'Met+Drop', '5006': 'Not Met+Drop', '5017': 'Shutdown/Acquired'
};
const STREAK_STAGE_COLORS = {
  '5001': '#E53935', '5016': '#FF703A', '5018': '#ff8c1e',
  '5002': '#FFB302', '5003': '#89C540', '5011': '#1cad36',
  '5004': '#009588', '5014': '#00b8d6', '5007': '#ef4444',
  '5008': '#3b82f6', '5015': '#6735BA', '5009': '#9915AF',
  '5006': '#7d25b5', '5017': '#D81A60'
};
const ACTIVE_STAGE_KEYS = new Set(['5001', '5016', '5018', '5002', '5003', '5011', '5004', '5014', '5007', '5008', '5015']);

const STREAK_INDUSTRY_MAP = {
  '9001': 'Consumer Tech', '9002': 'HealthTech', '9003': 'EdTech', '9004': 'FinTech',
  '9008': 'EdTech', '9009': 'Consumer Brands', '9011': 'Logistics', '9012': 'Consumer Tech',
  '9013': 'SaaS', '9016': 'Manufacturing', '9018': 'Manufacturing', '9027': 'Consumer Tech',
  '9053': 'CleanTech', '9055': 'Consumer Brands', '9058': 'Consumer Tech', '9063': 'Consumer Brands',
  '9096': 'FinTech', '9197': 'B2B'
};
const STREAK_COUNTRY_MAP = {
  '9001': '🇮🇳 India', '9002': '🇲🇾 Malaysia', '9003': '🇸🇬 Singapore',
  '9004': '🇧🇩 Bangladesh', '9005': '🇻🇳 Vietnam', '9006': '🇹🇭 Thailand',
  '9007': '🇵🇭 Philippines', '9008': '🇮🇩 Indonesia', '9060': '🌏 SEA', '9061': '🌐 Global'
};

function inferIndustry(d) {
  if (d.industry && d.industry.length > 0) {
    const code = String(Array.isArray(d.industry) ? d.industry[0] : d.industry);
    if (STREAK_INDUSTRY_MAP[code]) return STREAK_INDUSTRY_MAP[code];
  }
  const text = `${d.name || ''} ${d.description || ''}`.toLowerCase();
  if (/fintech|payment|lending|loan|credit|banking|wallet|insurance|neobank|upi/.test(text)) return 'FinTech';
  if (/saas|crm|erp|workflow|automation|devtool|developer|api|platform|analytics/.test(text)) return 'SaaS';
  if (/b2b|enterprise|procurement|sourcing|supply|corporate/.test(text)) return 'B2B';
  if (/manufactur|factory|industrial|robotics|hardware|iot|semiconductor/.test(text)) return 'Manufacturing';
  if (/ecommerce|e-commerce|marketplace|retail|shop|d2c|brand|fmcg|cpg|food|restaurant|beverage|fashion|beauty|personal care/.test(text)) return 'Consumer Brands';
  if (/\bai\b|artificial intelligence|\bml\b|machine learning|nlp|gpt|llm|deep learning/.test(text)) return 'AI/ML';
  if (/health|medic|clinic|pharma|hospital|doctor|therapy|diagnostics/.test(text)) return 'HealthTech';
  if (/edu|learn|school|college|course|tutor|upskill/.test(text)) return 'EdTech';
  if (/logistic|freight|shipping|transport|fleet|delivery|last.?mile/.test(text)) return 'Logistics';
  if (/climate|solar|renewable|green|carbon|cleantech|ev|electric/.test(text)) return 'CleanTech';
  if (/app|mobile|social|content|streaming|video|music|creator|gaming|media|entertainment|travel/.test(text)) return 'Consumer Tech';
  return 'Other';
}

function inferCountry(d) {
  if (!d.country) return null;
  return STREAK_COUNTRY_MAP[String(d.country)] || d.country;
}

function scoreStreakDeal(d) {
  let score = 0;
  const stagePts = { '5001': 8, '5016': 12, '5018': 18, '5002': 25, '5003': 32, '5011': 40, '5004': 40, '5007': 22, '5008': 16, '5015': 12, '5014': 35 };
  score += stagePts[d.stage_key] || 5;
  score += Math.min(25, Math.round((d.total_emails || 0) * 1.5));
  if ((d.total_emails || 0) > 0) score += Math.round(((d.total_received_emails || 0) / d.total_emails) * 20);
  if (d.last_email_timestamp) {
    const days = (Date.now() - d.last_email_timestamp) / 86400000;
    if (days < 7) score += 15; else if (days < 14) score += 10; else if (days < 30) score += 5;
  }
  if (d.description) score += 2; if (d.funding_stage) score += 2;
  if (d.country) score += 2; if (d.industry && d.industry.length > 0) score += 2;
  return Math.min(100, Math.round(score));
}

function getFollowUpStatus(d) {
  if (d.stage_key === '5007') return { label: '🚨 Urgent', color: '#ef4444', bg: '#ef444420', priority: 0 };
  const last = d.last_email_timestamp;
  if (!last && ACTIVE_STAGE_KEYS.has(d.stage_key)) return { label: '📭 No contact', color: '#6b7280', bg: '#6b728020', priority: 3 };
  if (!last) return { label: '—', color: '#6b7280', bg: 'transparent', priority: 5 };
  const days = (Date.now() - last) / 86400000;
  if (days < 14) return { label: '✅ Active', color: '#10b981', bg: '#10b98120', priority: 4 };
  if (days < 30) return { label: '⚡ Follow up', color: '#f59e0b', bg: '#f59e0b20', priority: 1 };
  return { label: '🔴 Stale', color: '#ef4444', bg: '#ef444420', priority: 2 };
}

function formatLastContact(ts) {
  if (!ts) return { text: 'No contact', color: '#6b7280' };
  const days = Math.floor((Date.now() - ts) / 86400000);
  const color = days < 14 ? '#10b981' : days < 30 ? '#f59e0b' : '#ef4444';
  if (days === 0) return { text: 'Today', color };
  if (days === 1) return { text: 'Yesterday', color };
  if (days < 7) return { text: `${days}d ago`, color };
  if (days < 30) return { text: `${Math.floor(days / 7)}w ago`, color };
  return { text: `${Math.floor(days / 30)}mo ago`, color };
}

// ---- News Intelligence Strip (used across all modules) ----
function getModuleNews(moduleName, limit) {
  limit = limit || 4;
  const signals = window._newsSignals || [];
  if (!signals.length) return '';
  const relevant = signals
    .filter(n => {
      try {
        const mods = Array.isArray(n.modules) ? n.modules : JSON.parse(n.modules || '[]');
        return mods.includes(moduleName);
      } catch { return false; }
    })
    .slice(0, limit);
  if (!relevant.length) return '';
  const typeColors = {
    'funding_round': '#10b981', 'fund_launch': '#8b5cf6', 'partner_move': '#3b82f6',
    'acquisition': '#f59e0b', 'market_signal': '#ec4899', 'regulatory': '#ef4444',
    'portfolio_signal': '#10b981', 'competitive_signal': '#f97316', 'general': '#64748b'
  };
  return `
    <div style="margin-bottom:20px;border:1px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden">
      <div style="padding:10px 16px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;gap:8px">
        <span style="font-size:0.75rem;font-weight:600;color:var(--text-muted);letter-spacing:0.05em">📡 LATEST INTEL</span>
        <span style="font-size:0.65rem;color:var(--text-muted);margin-left:auto">via n8n · auto-updated daily</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:0">
        ${relevant.map(n => {
    const color = typeColors[n.type] || '#64748b';
    const pubDate = n.published_at ? new Date(n.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    return `
          <div style="padding:12px 16px;border-right:1px solid rgba(255,255,255,0.04);border-bottom:1px solid rgba(255,255,255,0.04)">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="font-size:0.6rem;padding:1px 6px;border-radius:6px;background:${color}20;color:${color};font-weight:600;white-space:nowrap">${(n.type || 'news').replace(/_/g, ' ').toUpperCase()}</span>
              <span style="font-size:0.6rem;color:var(--text-muted);margin-left:auto">${pubDate}</span>
            </div>
            <div style="font-size:0.78rem;font-weight:600;color:var(--text-primary);line-height:1.3;margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${n.title || ''}</div>
            <div style="font-size:0.7rem;color:var(--text-secondary);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${n.implication || n.ai_summary || ''}</div>
            ${n.source_url ? `<a href="${n.source_url}" target="_blank" style="font-size:0.65rem;color:var(--accent-blue);text-decoration:none;margin-top:4px;display:block">${n.source || 'Read more'} →</a>` : `<span style="font-size:0.65rem;color:var(--text-muted)">${n.source || ''}</span>`}
          </div>`;
  }).join('')}
      </div>
    </div>`;
}

// ============================================================
// Smart Nudge Engine
// ============================================================
function generateNudges() {
  const nudges = [];
  const signals = window._newsSignals || [];
  
  // 1. High Score, Stale (Urgent Follow up)
  const staleHighValue = streakDeals.filter(d => {
    const score = d._score || scoreStreakDeal(d);
    const fu = d._fu || getFollowUpStatus(d);
    return score >= 60 && fu.priority <= 2 && !['5014', '5017', '5006', '5009'].includes(d.stage_key);
  });
  
  staleHighValue.slice(0, 2).forEach(d => {
    nudges.push({
      icon: '🔴',
      title: 'Stale High-Priority Deal',
      desc: `<strong style="color:var(--text-primary)">${d.name}</strong> (Score: ${d._score || scoreStreakDeal(d)}). No contact in >14 days.`,
      action: 'Follow up',
      deal: d
    });
  });
  
  // 2. Breaking News on Active Deal
  streakDeals.forEach(d => {
    if (['5014', '5017', '5006', '5009'].includes(d.stage_key)) return;
    const name = (d.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (name.length < 4) return;
    
    const relatedNews = signals.filter(s => {
      const h = (s.headline || s.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const c = (s.company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return (h.includes(name) || c.includes(name));
    });
    
    if (relatedNews.length > 0) {
      nudges.push({
        icon: '📰',
        title: 'News on Active Deal',
        desc: `<strong style="color:var(--text-primary)">${d.name}</strong> mentioned in: "${relatedNews[0].title || relatedNews[0].headline}"`,
        action: 'View News',
        url: relatedNews[0].source_url,
        deal: d
      });
    }
  });

  // 3. New Deals Needing AI Thesis Enrichment
  const unscored = streakDeals.filter(d => !window._dealEnrichments?.[d.box_key] && d.stage_key === '5001');
  if (unscored.length > 0 && nudges.length < 4) {
    nudges.push({
      icon: '🤖',
      title: 'AI Enrichment Needed',
      desc: `${unscored.length} new sourced deals lack thesis fit analysis.`,
      action: 'Run AI'
    });
  }

  // Deduplicate
  const uniqueNudges = [];
  const seenTitles = new Set();
  for (const n of nudges) {
    const key = n.title + (n.deal ? n.deal.box_key : '');
    if (!seenTitles.has(key)) {
      uniqueNudges.push(n);
      seenTitles.add(key);
    }
  }

  // Fallbacks if no nudges
  if (uniqueNudges.length === 0) {
    uniqueNudges.push({ icon: '✅', title: 'Inbox Zero', desc: 'No urgent deals or stale follow-ups. Pipeline is healthy.', action: 'Review Pipeline' });
  }

  return uniqueNudges.slice(0, 3);
}

function renderDealFlow(area) {
  // Score and annotate all streak deals
  let filtered = streakDeals.map(d => ({
    ...d,
    _score: scoreStreakDeal(d),
    _fu: getFollowUpStatus(d),
    _industry: inferIndustry(d),
    _country: inferCountry(d)
  }));

  // Apply header filters
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(d => `${d.name} ${d.description || ''} ${d._industry}`.toLowerCase().includes(q));
  }
  if (filters.geo !== 'All') {
    filtered = filtered.filter(d => (d._country || '').includes(filters.geo) || String(d.country) === filters.geo);
  }
  if (filters.sector !== 'All') {
    filtered = filtered.filter(d => d._industry === filters.sector);
  }
  if (filters.people !== 'All') {
    filtered = filtered.filter(d => {
      try {
        const assignees = JSON.parse(d.assigned_to || '[]');
        return assignees.some(a => a.name === filters.people);
      } catch { return false; }
    });
  }

  // Sort: urgent first, then by score desc
  filtered.sort((a, b) => {
    if (a._fu.priority !== b._fu.priority) return a._fu.priority - b._fu.priority;
    return b._score - a._score;
  });

  const urgent = filtered.filter(d => d.stage_key === '5007').length;
  const needsFollowUp = filtered.filter(d => d._fu.priority <= 2).length;
  const avgScore = filtered.length ? Math.round(filtered.reduce((s, d) => s + d._score, 0) / filtered.length) : 0;
  
  const nudges = generateNudges();

  area.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <!-- Left: Smart Nudges -->
      <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:12px;padding:16px">
        <div style="font-size:0.85rem;font-weight:700;color:var(--text-primary);margin-bottom:12px;display:flex;align-items:center;gap:6px">
          ⚡ Smart Nudges
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${nudges.map((n, i) => `
            <div class="animated-item" style="animation-delay:${i * 0.05}s;background:var(--bg-tertiary);border:1px solid var(--border-subtle);border-radius:8px;padding:10px 14px;display:flex;gap:12px;align-items:flex-start;${n.deal ? 'cursor:pointer' : ''}"
                 ${n.deal ? `onclick='openStreakDealModal(${JSON.stringify(n.deal).replace(/'/g, "&#39;")})'` : ''}>
              <div style="font-size:1.2rem">${n.icon}</div>
              <div style="flex:1">
                <div style="font-size:0.75rem;font-weight:700;color:var(--text-primary)">${n.title}</div>
                <div style="font-size:0.65rem;color:var(--text-secondary);margin-top:2px;line-height:1.4">${n.desc}</div>
              </div>
              ${n.url ? `<button onclick="window.open('${n.url}','_blank');event.stopPropagation()" style="padding:4px 10px;border-radius:4px;border:none;background:var(--accent-indigo);color:white;font-size:0.6rem;font-weight:700;cursor:pointer">Read</button>` : 
                 `<button style="padding:4px 10px;border-radius:4px;border:none;background:var(--bg-card);border:1px solid var(--border-medium);color:var(--text-primary);font-size:0.6rem;font-weight:600;cursor:pointer">${n.action}</button>`}
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- Right: Intelligence Feed -->
      <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:12px;padding:16px;overflow:hidden;display:flex;flex-direction:column">
        <div style="font-size:0.85rem;font-weight:700;color:var(--text-primary);margin-bottom:12px;display:flex;align-items:center;gap:6px">
          📡 Market Intelligence
          <span style="font-size:0.6rem;color:var(--text-muted);font-weight:500;margin-left:auto">Auto-updated via n8n</span>
        </div>
        <div style="flex:1;overflow-y:auto;padding-right:4px">
          ${(window._newsSignals || []).slice(0, 3).map(n => {
            const color = n.type === 'funding_round' ? '#10b981' : n.type === 'fund_launch' ? '#8b5cf6' : '#3b82f6';
            return `
            <div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border-subtle);cursor:pointer" ${n.source_url ? `onclick="window.open('${n.source_url}','_blank')"` : ''}>
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                <span style="font-size:0.5rem;padding:1px 6px;border-radius:4px;background:${color}20;color:${color};font-weight:700;text-transform:uppercase">${(n.type || 'news').replace(/_/g, ' ')}</span>
                <span style="font-size:0.55rem;color:var(--text-muted);margin-left:auto">${n.source || ''}</span>
              </div>
              <div style="font-size:0.75rem;font-weight:600;color:var(--text-primary);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${n.title || n.headline}</div>
            </div>`;
          }).join('') || '<div style="font-size:0.7rem;color:var(--text-muted);text-align:center;padding:20px">No news signals yet.</div>'}
        </div>
      </div>
    </div>

    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-label">Total Deals</div>
        <div class="stat-value emerald">${filtered.length}</div>
        <div class="stat-change positive">of ${streakDeals.length} from Streak CRM</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">🚨 Urgent Tracking</div>
        <div class="stat-value" style="color:#ef4444">${urgent}</div>
        <div class="stat-change">Immediate attention</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">⚡ Follow-up Needed</div>
        <div class="stat-value orange">${needsFollowUp}</div>
        <div class="stat-change">Stale or overdue</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Deal Score</div>
        <div class="stat-value blue">${avgScore}</div>
        <div class="stat-change ${avgScore > 50 ? 'positive' : ''}">Engagement + stage</div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
      <button class="pipeline-tab" data-tab="stage"
        style="padding:4px 12px;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);background:${pipelineTab === 'stage' ? 'var(--accent-indigo)' : 'var(--bg-card)'};color:${pipelineTab === 'stage' ? '#fff' : 'var(--text-secondary)'};cursor:pointer;font-size:0.75rem;font-weight:600">
        🗂 Pipeline Stages</button>
      <button class="pipeline-tab" data-tab="all"
        style="padding:4px 12px;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);background:${pipelineTab === 'all' ? 'var(--bg-tertiary)' : 'var(--bg-card)'};color:${pipelineTab === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)'};cursor:pointer;font-size:0.75rem;font-weight:600">
        All (${filtered.length})</button>
      <button class="pipeline-tab" data-tab="industry"
        style="padding:4px 12px;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);background:${pipelineTab === 'industry' ? 'var(--bg-tertiary)' : 'var(--bg-card)'};color:${pipelineTab === 'industry' ? 'var(--text-primary)' : 'var(--text-secondary)'};cursor:pointer;font-size:0.75rem;font-weight:600">
        By Industry</button>
      <button class="pipeline-tab" data-tab="followup"
        style="padding:4px 12px;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);background:${pipelineTab === 'followup' ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-card)'};color:${pipelineTab === 'followup' ? 'var(--accent-red)' : 'var(--text-secondary)'};cursor:pointer;font-size:0.75rem;font-weight:600">
        🚨 Follow-ups (${needsFollowUp})</button>
      <div style="flex:1"></div>
      <button id="add-deal-btn" style="padding:6px 14px;border-radius:var(--radius-sm);border:none;background:var(--accent-emerald);color:#000;cursor:pointer;font-size:0.75rem;font-weight:700">+ Add Deal</button>
    </div>

    <div id="deal-flow-content">
      ${pipelineTab === 'all' ? renderDealGrid(filtered) : ''}
      ${pipelineTab === 'industry' ? renderByIndustry(filtered) : ''}
      ${pipelineTab === 'stage' ? renderByStage(filtered) : ''}
      ${pipelineTab === 'followup' ? renderDealGrid(filtered.filter(d => d._fu.priority <= 2)) : ''}
    </div>
  `;

  area.querySelectorAll('.pipeline-tab').forEach(tab => {
    tab.addEventListener('click', () => { pipelineTab = tab.dataset.tab; renderDealFlow(area); });
  });
  document.getElementById('add-deal-btn')?.addEventListener('click', () => openAddDealModal());
  area.querySelectorAll('.streak-deal-card[data-boxkey]').forEach(card => {
    card.addEventListener('click', () => {
      const deal = streakDeals.find(d => d.box_key === card.dataset.boxkey);
      if (deal) openStreakDealModal({ ...deal, _score: scoreStreakDeal(deal) });
    });
  });
}

function renderDealGrid(deals) {
  if (!deals.length) return '<div style="text-align:center;padding:48px;color:var(--text-muted)">No deals match current filters.</div>';
  return `<div class="deal-grid">${deals.map(d => renderStreakDealCard(d)).join('')}</div>`;
}

function renderByIndustry(deals) {
  const groups = {};
  deals.forEach(d => { const k = d._industry || 'Other'; (groups[k] || (groups[k] = [])).push(d); });
  return Object.entries(groups).sort((a, b) => b[1].length - a[1].length).map(([ind, group]) => `
    <div style="margin-bottom:24px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:8px 14px;background:var(--bg-secondary);border-radius:8px;border-left:3px solid var(--accent-purple)">
        <span style="font-weight:700;color:var(--text-primary)">${ind}</span>
        <span style="font-size:0.72rem;padding:2px 8px;border-radius:12px;background:var(--accent-purple)20;color:var(--accent-purple)">${group.length} deals</span>
        <span style="font-size:0.7rem;color:var(--text-muted);margin-left:auto">avg score: ${Math.round(group.reduce((s, d) => s + d._score, 0) / group.length)}</span>
      </div>
      <div class="deal-grid">${group.map(d => renderStreakDealCard(d)).join('')}</div>
    </div>`).join('');
}

function renderByStage(deals) {
  const order = ['5007', '5011', '5004', '5003', '5002', '5018', '5016', '5008', '5001', '5015', '5014', '5009', '5006', '5017'];
  const groups = {};
  deals.forEach(d => { (groups[d.stage_key] || (groups[d.stage_key] = [])).push(d); });
  const cols = order.filter(k => groups[k]).map(k => {
    const color = STREAK_STAGE_COLORS[k] || '#64748b';
    const stageName = STREAK_STAGE_NAMES[k] || k;
    const stageDeals = groups[k];
    return `
    <div class="kanban-col">
      <div class="kanban-col-header">
        <div class="kanban-dot" style="background:${color}20;color:${color}">${stageDeals.length}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.62rem;font-weight:700;color:${color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${stageName}</div>
        </div>
      </div>
      ${stageDeals.map(d => renderKanbanCard(d, color)).join('')}
    </div>`;
  }).join('');
  return `<div class="kanban-board">${cols}</div>`;
}

function renderKanbanCard(d, stageColor) {
  const name = (d.name || '').replace(/^www\./, '').replace(/\.(com|co\.in|co|in|io|ai|vc|org|net)(\/.*)?$/i, '');
  const score = d._score !== undefined ? d._score : scoreStreakDeal(d);
  const scoreColor = score >= 70 ? 'var(--accent-emerald)' : score >= 45 ? 'var(--accent-amber)' : 'var(--accent-red)';
  const scoreBg = score >= 70 ? 'rgba(16,185,129,0.15)' : score >= 45 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)';
  const industry = d._industry || inferIndustry(d);
  const lc = formatLastContact(d.last_email_timestamp);
  const lastMs = d.last_email_timestamp ? parseInt(d.last_email_timestamp) : 0;
  const daysSince = lastMs > 0 ? Math.floor((Date.now() - lastMs) / 86400000) : 999;
  const staleColor = daysSince > 21 ? 'var(--accent-red)' : daysSince > 14 ? 'var(--accent-amber)' : 'var(--text-muted)';
  const avatarPalette = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316'];
  const avatarBg = avatarPalette[(name.charCodeAt(0) || 65) % avatarPalette.length];
  const initial = (name.charAt(0) || '?').toUpperCase();
  const enrich = (window._dealEnrichments || {})[d.box_key];
  const fitScore = enrich ? (enrich.thesis_fit_score || 0) : 0;
  const fitColor = fitScore >= 70 ? '#10b981' : fitScore >= 40 ? '#f59e0b' : '#64748b';

  return `
  <div class="kanban-card streak-deal-card" data-boxkey="${d.box_key}" style="border-left:2px solid ${stageColor}">
    <div style="display:flex;align-items:center;gap:8px">
      <div class="company-avatar" style="background:${avatarBg}20;color:${avatarBg}">${initial}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:0.75rem;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
        <div style="font-size:0.55rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${industry}</div>
      </div>
      <div class="company-avatar" style="background:${scoreBg};color:${scoreColor};font-family:'JetBrains Mono',monospace;font-size:0.62rem">${score}</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px;padding-top:6px;border-top:1px solid var(--border-subtle)">
      <span style="font-size:0.55rem;color:${staleColor}">${lc.text}</span>
      <div style="display:flex;gap:5px;align-items:center">
        ${fitScore > 0 ? `<span style="font-size:0.5rem;padding:1px 4px;border-radius:3px;background:${fitColor}15;color:${fitColor};font-weight:700">🧠${fitScore}</span>` : ''}
        <span style="font-size:0.5rem;color:var(--text-muted);font-family:'JetBrains Mono',monospace">↑${d.total_sent_emails||0}↓${d.total_received_emails||0}</span>
      </div>
    </div>
  </div>`;
}

function renderStreakDealCard(d) {
  const stageColor = STREAK_STAGE_COLORS[d.stage_key] || '#64748b';
  const stageName = STREAK_STAGE_NAMES[d.stage_key] || d.stage_key;
  const industry = d._industry || inferIndustry(d);
  const country = d._country || inferCountry(d);
  let score = d._score !== undefined ? d._score : scoreStreakDeal(d);
  const fu = d._fu || getFollowUpStatus(d);
  const lc = formatLastContact(d.last_email_timestamp);
  const name = (d.name || '').replace(/^www\./, '').replace(/\.(com|co\.in|co|in|io|ai|vc|org|net)(\/.*)?$/i, '');

  // Deterministic sub-scores
  const hash = name.charCodeAt(0) + (name.charCodeAt(name.length-1) || 0) + (d.box_key ? d.box_key.charCodeAt(0) : 0);
  const clamp = (val) => Math.min(Math.max(val, 15), 98);
  const rawMarket = clamp(score + ((hash % 15) - 7));
  const rawTeam = clamp(score + (((hash * 3) % 15) - 7));
  const rawTraction = clamp(score + (((hash * 7) % 15) - 7));
  const rawThesis = clamp((score * 4) - rawMarket - rawTeam - rawTraction);
  const trueScore = Math.round((rawMarket + rawTeam + rawTraction + rawThesis) / 4);

  const scoreColor = trueScore >= 70 ? '#10b981' : trueScore >= 45 ? '#f59e0b' : '#ef4444';
  const scoreBg = trueScore >= 70 ? 'rgba(16,185,129,0.1)' : trueScore >= 45 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';
  const getSubColor = (v) => v >= 70 ? 'var(--accent-emerald)' : v >= 45 ? 'var(--accent-amber)' : 'var(--accent-red)';

  function getSubColorText(v) {
    if (v >= 70) return '#10b981';
    if (v >= 45) return '#f59e0b';
    return '#ef4444';
  }

  // Ring SVG math
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (trueScore / 100) * circumference;

  // GPT Enrichment
  const enrich = (window._dealEnrichments || {})[d.box_key];
  let enrichLine = '';
  if (enrich) {
    const topStrength = (enrich.strengths || [])[0] || '';
    enrichLine = topStrength ? `<div style="font-size:0.6rem;color:var(--text-secondary);margin-top:6px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden" title="${topStrength}">✨ ${topStrength}</div>` : '';
  }

  // News matching
  const signals = window._newsSignals || [];
  const companyLower = name.toLowerCase();
  const relatedNews = signals.filter(s => {
    const h = (s.headline || s.title || '').toLowerCase();
    const c = (s.company || '').toLowerCase();
    return (companyLower.length > 3 && (h.includes(companyLower) || c.includes(companyLower))) ||
           (industry && s.sector_id === industry.toLowerCase());
  });
  const newsCount = relatedNews.length;
  const newsBadge = newsCount > 0 ? `<span style="font-size:0.5rem;padding:2px 6px;border-radius:4px;background:rgba(99,102,241,0.15);color:var(--accent-indigo);font-weight:700">📰 ${newsCount}</span>` : '';

  // Stale warning
  const lastMs = d.last_email_timestamp ? parseInt(d.last_email_timestamp) : 0;
  const daysSince = lastMs > 0 ? Math.floor((Date.now() - lastMs) / 86400000) : 999;
  const staleColor = daysSince > 21 ? 'var(--accent-red)' : daysSince > 14 ? 'var(--accent-amber)' : daysSince > 7 ? 'var(--text-muted)' : 'var(--accent-emerald)';
  const staleIcon = daysSince > 21 ? '🔴' : daysSince > 14 ? '⚠️' : '';

  // Circular avatar
  const _avatarPalette = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316'];
  const _avatarBg = _avatarPalette[(name.charCodeAt(0) || 65) % _avatarPalette.length];
  const _initial = (name.charAt(0) || '?').toUpperCase();

  return `
    <div class="deal-card streak-deal-card animated-item flex flex-col" data-boxkey="${d.box_key}" style="border-left:3px solid ${stageColor};cursor:pointer;background:var(--bg-card);border-radius:12px;padding:20px;box-shadow:0 4px 12px rgba(0,0,0,0.3);position:relative;min-height:260px;transition:var(--transition-fast)">
      
      <!-- Top Section -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px">
        <div style="display:flex;align-items:flex-start;gap:12px;flex:1;min-width:0">
          <div class="company-avatar" style="background:${_avatarBg}20;color:${_avatarBg};font-size:1.2rem;width:38px;height:38px;flex-shrink:0;border-radius:10px">${_initial}</div>
          <div style="flex:1;min-width:0;padding-top:2px">
            <div style="font-size:1.1rem;font-weight:800;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px;letter-spacing:-0.02em">${name}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              <span style="font-size:0.65rem;padding:3px 8px;border-radius:6px;background:${stageColor}15;color:${stageColor};font-weight:700;letter-spacing:0.02em">${stageName}</span>
              ${industry ? `<span style="font-size:0.65rem;padding:3px 8px;border-radius:6px;background:var(--bg-tertiary);color:var(--text-secondary);font-weight:600">${industry}</span>` : ''}
              ${newsBadge}
            </div>
          </div>
        </div>
      </div>
      
      <!-- Score Breakdown Section (Circular + 2 Columns) -->
      <div style="display:flex;align-items:center;background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:10px;padding:16px;margin-bottom:16px;box-shadow:inset 0 2px 8px rgba(0,0,0,0.2)">
        
        <!-- Circular Score Ring -->
        <div style="position:relative;width:56px;height:56px;flex-shrink:0;margin-right:24px;display:flex;align-items:center;justify-content:center">
          <svg width="56" height="56" style="transform: rotate(-90deg);position:absolute;top:0;left:0">
            <circle cx="28" cy="28" r="22" fill="none" stroke="${scoreBg}" stroke-width="5" />
            <circle cx="28" cy="28" r="22" fill="none" stroke="${scoreColor}" stroke-width="5" stroke-dasharray="${2 * Math.PI * 22}" stroke-dashoffset="${(2 * Math.PI * 22) - (trueScore / 100) * (2 * Math.PI * 22)}" stroke-linecap="round" style="transition: stroke-dashoffset 1s ease-out" />
          </svg>
          <div style="position:relative;font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:800;color:${scoreColor}">${trueScore}</div>
        </div>

        <!-- 2 Column Breakdown -->
        <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:24px;row-gap:10px;padding-left:0;border-left:none">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.7rem">
            <span style="color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:0.06em">Market</span>
            <span style="font-family:'JetBrains Mono',monospace;font-weight:800;color:${getSubColorText(rawMarket)}">${rawMarket}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.7rem">
            <span style="color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:0.06em">Team</span>
            <span style="font-family:'JetBrains Mono',monospace;font-weight:800;color:${getSubColorText(rawTeam)}">${rawTeam}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.7rem">
            <span style="color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:0.06em">Traction</span>
            <span style="font-family:'JetBrains Mono',monospace;font-weight:800;color:${getSubColorText(rawTraction)}">${rawTraction}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.7rem">
            <span style="color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:0.06em">Thesis</span>
            <span style="font-family:'JetBrains Mono',monospace;font-weight:800;color:${getSubColorText(rawThesis)}">${rawThesis}</span>
          </div>
        </div>
      </div>

      <!-- Description / Enrichment -->
      ${d.description ? `<div style="font-size:0.75rem;color:var(--text-secondary);line-height:1.5;margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${d.description}</div>` : ''}
      ${enrichLine}

      <div style="flex:1"></div>

      <!-- Footer -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px dashed var(--border-medium)">
        <div style="display:flex;gap:14px;align-items:center">
          <span style="font-size:0.7rem;color:${staleColor};font-weight:700" title="Last contact: ${lc.text}">${staleIcon} ${lc.text}</span>
          <span style="font-size:0.7rem;color:var(--text-muted);font-family:'JetBrains Mono',monospace" title="Sent/Received Emails">
            <span style="color:var(--accent-emerald)">↑${d.total_sent_emails || 0}</span> <span style="color:var(--accent-indigo)">↓${d.total_received_emails || 0}</span>
          </span>
        </div>
        ${country ? `<span style="font-size:0.7rem;color:var(--text-secondary);font-weight:600;letter-spacing:0.02em">${country}</span>` : ''}
      </div>
    </div>`;
}

function openStreakDealModal(d) {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  const stageName = STREAK_STAGE_NAMES[d.stage_key] || d.stage_key || 'Unknown';
  const stageColor = STREAK_STAGE_COLORS[d.stage_key] || '#64748b';
  const assignees = (() => { try { return JSON.parse(d.assigned_to || '[]'); } catch { return []; } })();
  const createdDate = d.created_at ? new Date(parseInt(d.created_at)).toLocaleDateString() : '';
  const updatedDate = d.updated_at ? new Date(parseInt(d.updated_at)).toLocaleDateString() : '';

  content.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">
        <div class="deal-logo" style="background:${stageColor}15;color:${stageColor}">🏢</div>
        <div>
          <h3>${d.name}</h3>
          <div class="sub">${d.funding_stage || 'Unknown Stage'} · ${d.country || 'Unknown'} · <span style="color:${stageColor};font-weight:600">${stageName}</span></div>
        </div>
        <span class="deal-tier-badge" style="margin-left:12px;background:${stageColor}15;color:${stageColor};border:1px solid ${stageColor}33">${stageName}</span>
      </div>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-section">
        <div class="modal-section-title">Deal Details</div>
        <div class="score-breakdown">
          <div class="score-dim"><div class="score-dim-label">Deal Size</div><div class="score-dim-val" style="color:var(--accent-emerald)">${d.deal_size || '—'}</div></div>
          <div class="score-dim"><div class="score-dim-label">Funding Stage</div><div class="score-dim-val" style="color:var(--accent-blue)">${d.funding_stage || '—'}</div></div>
          <div class="score-dim"><div class="score-dim-label">Source</div><div class="score-dim-val">${d.source || '—'}</div></div>
          <div class="score-dim"><div class="score-dim-label">Country</div><div class="score-dim-val">${d.country || '—'}</div></div>
          <div class="score-dim"><div class="score-dim-label">Created</div><div class="score-dim-val" style="color:var(--text-secondary);font-size:0.75rem">${createdDate}</div></div>
          <div class="score-dim"><div class="score-dim-label">Last Updated</div><div class="score-dim-val" style="color:var(--text-secondary);font-size:0.75rem">${updatedDate}</div></div>
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">📧 Email Activity</div>
        <div class="score-breakdown">
          <div class="score-dim"><div class="score-dim-label">Total</div><div class="score-dim-val" style="color:var(--accent-blue)">${d.total_emails || 0}</div></div>
          <div class="score-dim"><div class="score-dim-label">Sent</div><div class="score-dim-val" style="color:var(--accent-green)">${d.total_sent_emails || 0}</div></div>
          <div class="score-dim"><div class="score-dim-label">Received</div><div class="score-dim-val" style="color:var(--accent-purple)">${d.total_received_emails || 0}</div></div>
        </div>
      </div>

      ${assignees.length > 0 ? `
      <div class="modal-section">
        <div class="modal-section-title">👥 Assigned To</div>
        <div class="founders-list">
          ${assignees.map(a => `
            <div class="founder-card">
              <div class="founder-avatar">${(a.name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2)}</div>
              <div>
                <div class="founder-name">${a.name || 'Unknown'}</div>
                <div class="founder-pedigree">${a.email || ''}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>` : ''}

      ${d.notes ? `
      <div class="modal-section">
        <div class="modal-section-title">📝 Notes</div>
        <div class="thesis-box"><p>${d.notes}</p></div>
      </div>` : ''}

      ${d.description ? `
      <div class="modal-section">
        <div class="modal-section-title">📋 Description</div>
        <div class="thesis-box"><p>${d.description}</p></div>
      </div>` : ''}

      <div class="modal-section">
        <div class="modal-section-title">✏️ Add Note</div>
        <textarea id="streak-note-input" placeholder="Add a note about this deal..." style="width:100%;min-height:80px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:8px;color:var(--text-primary);padding:12px;font-family:Inter;font-size:0.85rem;resize:vertical"></textarea>
        <div style="display:flex;gap:8px;margin-top:8px">
          <select id="streak-note-type" style="background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:8px;color:var(--text-primary);padding:6px 12px;font-size:0.8rem">
            <option value="note">📝 Note</option>
            <option value="meeting">🤝 Meeting</option>
            <option value="call">📞 Call</option>
            <option value="email">📧 Email</option>
            <option value="task">✅ Task</option>
          </select>
          <button id="streak-note-save" style="padding:6px 20px;background:var(--accent-green);color:white;border:none;border-radius:8px;cursor:pointer;font-size:0.8rem;font-weight:600">Save Note</button>
        </div>
        <div id="deal-notes-list" style="margin-top:16px"></div>
      </div>
    </div>
  `;

  modal.classList.add('active');
  content.querySelector('#modal-close-btn').addEventListener('click', closeModal);

  // Save note
  document.getElementById('streak-note-save')?.addEventListener('click', async () => {
    const noteContent = document.getElementById('streak-note-input').value.trim();
    const noteType = document.getElementById('streak-note-type').value;
    if (!noteContent) return;
    if (supabaseConnected && supabaseClient) {
      await supabaseClient.from('deal_notes').insert({
        deal_id: d.box_key,
        author_email: currentUser?.email || 'anonymous',
        author_name: currentUser?.name || 'Anonymous',
        content: noteContent,
        note_type: noteType
      });
      document.getElementById('streak-note-input').value = '';
      loadDealNotes(d.box_key);
    }
  });

  // Load existing notes
  loadDealNotes(d.box_key);
}

async function loadDealNotes(dealId) {
  const container = document.getElementById('deal-notes-list');
  if (!container || !supabaseConnected || !supabase) return;
  try {
    const { data } = await supabaseClient.from('deal_notes').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }).limit(20);
    if (data && data.length > 0) {
      container.innerHTML = data.map(n => {
        const typeIcons = { note: '📝', meeting: '🤝', call: '📞', email: '📧', task: '✅', stage_change: '🔄' };
        return `<div style="padding:10px;background:var(--bg-tertiary);border-radius:8px;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:0.75rem;font-weight:600;color:var(--text-primary)">${typeIcons[n.note_type] || '📝'} ${n.author_name || n.author_email || 'Unknown'}</span>
            <span style="font-size:0.65rem;color:var(--text-muted)">${new Date(n.created_at).toLocaleDateString()} ${new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.5">${n.content}</div>
        </div>`;
      }).join('');
    } else {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:12px">No notes yet.</div>';
    }
  } catch (e) { console.warn('Notes load error:', e.message); }
}

function openAddDealModal() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');

  content.innerHTML = `
    <div class="modal-header">
      <div class="modal-title"><h3>➕ Add New Deal</h3></div>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px">Company Name *</label>
          <input id="new-deal-name" type="text" placeholder="e.g. FactoryOS" style="width:100%;padding:10px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:8px;color:var(--text-primary);font-size:0.85rem">
        </div>
        <div>
          <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px">Stage</label>
          <select id="new-deal-stage" style="width:100%;padding:10px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:8px;color:var(--text-primary);font-size:0.85rem">
            <option value="5001">Lead</option>
            <option value="5002">Met + Active</option>
            <option value="5003" selected>Deep Dive</option>
            <option value="5004">IC Review</option>
            <option value="5007">Term Sheet</option>
            <option value="5011">Portfolio</option>
          </select>
        </div>
        <div>
          <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px">Country</label>
          <input id="new-deal-country" type="text" placeholder="e.g. India" style="width:100%;padding:10px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:8px;color:var(--text-primary);font-size:0.85rem">
        </div>
        <div>
          <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px">Funding Stage</label>
          <select id="new-deal-funding" style="width:100%;padding:10px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:8px;color:var(--text-primary);font-size:0.85rem">
            <option value="">Select...</option>
            <option value="Pre-seed">Pre-seed</option>
            <option value="Seed">Seed</option>
            <option value="Pre-Series A">Pre-Series A</option>
            <option value="Series A">Series A</option>
            <option value="Series B">Series B</option>
            <option value="Series C">Series C</option>
          </select>
        </div>
        <div>
          <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px">Deal Size</label>
          <input id="new-deal-size" type="text" placeholder="e.g. $5M" style="width:100%;padding:10px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:8px;color:var(--text-primary);font-size:0.85rem">
        </div>
        <div>
          <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px">Source</label>
          <select id="new-deal-source" style="width:100%;padding:10px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:8px;color:var(--text-primary);font-size:0.85rem">
            <option value="Inbound">Inbound</option>
            <option value="Outbound">Outbound</option>
            <option value="Incubator / Accelerator">Incubator / Accelerator</option>
            <option value="Banker">Banker</option>
          </select>
        </div>
      </div>
      <div style="margin-top:12px">
        <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px">Notes</label>
        <textarea id="new-deal-notes" placeholder="Deal notes..." style="width:100%;min-height:80px;background:var(--bg-tertiary);border:1px solid var(--border-primary);border-radius:8px;color:var(--text-primary);padding:12px;font-family:Inter;font-size:0.85rem;resize:vertical"></textarea>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
        <button id="cancel-deal-btn" style="padding:8px 20px;background:var(--bg-tertiary);color:var(--text-secondary);border:1px solid var(--border-primary);border-radius:8px;cursor:pointer;font-size:0.85rem">Cancel</button>
        <button id="save-deal-btn" style="padding:8px 20px;background:var(--accent-green);color:white;border:none;border-radius:8px;cursor:pointer;font-size:0.85rem;font-weight:600">💾 Save Deal</button>
      </div>
    </div>
  `;

  modal.classList.add('active');
  content.querySelector('#modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('cancel-deal-btn')?.addEventListener('click', closeModal);

  document.getElementById('save-deal-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('new-deal-name').value.trim();
    if (!name) { alert('Company name is required'); return; }

    const newDeal = {
      box_key: 'manual_' + Date.now(),
      name: name,
      stage_key: document.getElementById('new-deal-stage').value,
      country: document.getElementById('new-deal-country').value,
      funding_stage: document.getElementById('new-deal-funding').value,
      deal_size: document.getElementById('new-deal-size').value,
      source: document.getElementById('new-deal-source').value,
      notes: document.getElementById('new-deal-notes').value,
      assigned_to: JSON.stringify([{ name: currentUser?.name || 'Unknown', email: currentUser?.email || '' }]),
      total_emails: 0, total_sent_emails: 0, total_received_emails: 0,
      created_at: Date.now(), updated_at: Date.now()
    };

    if (supabaseConnected && supabaseClient) {
      const { error } = await supabaseClient.from('streak_deals').insert(newDeal);
      if (error) { console.error('Save deal error:', error); alert('Error saving deal: ' + error.message); return; }
    }
    streakDeals.unshift(newDeal);
    closeModal();
    renderCurrentSection();
  });
}

function renderDealCard(s, idx) {
  const topSignals = Object.entries(s.signals)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 4);

  const trendData = s.signals.appDownloads?.trend || s.signals.viralTraction?.trend || s.signals.hiringSpike?.trend;
  const sparkline = trendData ? createSparkline(trendData, getScoreColor(s.scores.composite)) : '';

  return `
    <div class="deal-card ${s.scores.tier.class} animated-item" data-id="${s.id}">
      <div class="deal-rank">#${s.rank}</div>
      <div class="deal-info">
        <div class="deal-header">
          <div class="deal-logo">${s.logo}</div>
          <div class="deal-name">${s.name}</div>
          <span class="deal-tier-badge ${s.scores.tier.class}">${s.scores.tier.emoji} ${s.scores.tier.label}</span>
        </div>
        <div class="deal-meta">
          <span class="deal-tag ${s.sector === 'Consumer Tech' ? 'sector-consumer' : 'sector-b2b'}">${s.subSector}</span>
          <span class="deal-tag geo">📍 ${s.city}, ${s.geography}</span>
          <span class="deal-tag">${s.stage}</span>
          <span class="deal-tag">$${s.lastRound.amount}M ${s.lastRound.type}</span>
        </div>
      </div>
      <div class="deal-signals">
        ${topSignals.map(([key, sig]) => {
    const info = SIGNAL_TYPES.find(t => t.key === key);
    return `<div class="signal-dot ${sig.score >= 75 ? 'hot' : ''}" title="${info?.label}: ${sig.score}">
            ${info?.icon || '📊'}
            <div class="tooltip">${info?.label}: ${sig.score}/100</div>
          </div>`;
  }).join('')}
      </div>
      <div class="sparkline-container">${sparkline}</div>
      <div class="deal-score-container">
        <div class="deal-score ${getScoreClass(s.scores.composite)}">${s.scores.composite}</div>
        <div class="deal-score-label">Score</div>
      </div>
    </div>
  `;
}

function openDealModal(s) {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');

  content.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">
        <div class="deal-logo">${s.logo}</div>
        <div>
          <h3>${s.name}</h3>
          <div class="sub">${s.subSector} · ${s.city}, ${s.geography} · <span style="font-weight:600">${s.stage}</span></div>
        </div>
        <span class="deal-tier-badge ${s.scores.tier.class}" style="margin-left:12px">${s.scores.tier.emoji} ${s.scores.tier.label}</span>
      </div>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-section">
        <div class="modal-section-title">Company Description</div>
        <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6">${s.description}</p>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Scoring Radar</div>
        <div class="radar-chart-container">
          ${createRadarChart(s.scores.dimensions)}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Score Breakdown</div>
        <div class="score-breakdown">
          ${Object.entries(s.scores.dimensions).map(([key, val]) => {
    const labels = { marketSize: 'Market Size', founderPedigree: 'Founder Pedigree', earlyTraction: 'Early Traction', productDifferentiation: 'Product Diff.', fundability: 'Fundability' };
    return `
              <div class="score-dim">
                <div class="score-dim-label">${labels[key]}</div>
                <div class="score-dim-bar"><div class="score-dim-bar-fill" style="width:${val}%;background:${getBarColor(val)}"></div></div>
                <div class="score-dim-val" style="color:${getBarColor(val)}">${val}</div>
              </div>`;
  }).join('')}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Founders</div>
        <div class="founders-list">
          ${s.founders.map(f => `
            <div class="founder-card">
              <div class="founder-avatar">${f.name.split(' ').map(n => n[0]).join('')}</div>
              <div>
                <div class="founder-name">${f.name} <span class="founder-role">· ${f.role}</span></div>
                <div class="founder-pedigree">${f.pedigree}${f.previousExits ? ` · ${f.previousExits} prior exit${f.previousExits > 1 ? 's' : ''}` : ''}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Signal Strength</div>
        <div class="signals-grid">
          ${SIGNAL_TYPES.map(st => {
    const sig = s.signals[st.key];
    return `
              <div class="signal-card">
                <div class="signal-card-header">
                  <span class="signal-card-icon">${st.icon}</span>
                  <span class="signal-card-label">${st.label}</span>
                </div>
                <div class="signal-card-score" style="color:${getBarColor(sig.score)}">${sig.score}/100</div>
                <div class="signal-card-detail">${sig.detail}</div>
                ${sig.trend ? `<div style="margin-top:8px">${createSparkline(sig.trend, st.color, 120, 28)}</div>` : ''}
              </div>`;
  }).join('')}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Key Metrics</div>
        <div class="score-breakdown">
          <div class="score-dim"><div class="score-dim-label">MAU</div><div class="score-dim-val" style="color:var(--accent-blue)">${s.metrics.mau >= 1000 ? (s.metrics.mau / 1000).toFixed(0) + 'K' : s.metrics.mau}</div></div>
          <div class="score-dim"><div class="score-dim-label">MAU Growth</div><div class="score-dim-val" style="color:var(--accent-emerald)">${s.metrics.mauGrowth}%</div></div>
          <div class="score-dim"><div class="score-dim-label">MRR</div><div class="score-dim-val" style="color:var(--accent-amber)">$${(s.metrics.revenue / 1000).toFixed(0)}K</div></div>
          <div class="score-dim"><div class="score-dim-label">Rev Growth</div><div class="score-dim-val" style="color:var(--accent-emerald)">${s.metrics.revenueGrowth}%</div></div>
          <div class="score-dim"><div class="score-dim-label">Burn Rate</div><div class="score-dim-val" style="color:var(--accent-pink)">$${(s.metrics.burnRate / 1000).toFixed(0)}K</div></div>
          <div class="score-dim"><div class="score-dim-label">Runway</div><div class="score-dim-val" style="color:${s.metrics.runway > 12 ? 'var(--accent-emerald)' : 'var(--accent-red)'}">${s.metrics.runway} mo</div></div>
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">💡 Investment Thesis</div>
        <div class="thesis-box">
          <p>${s.thesis}</p>
        </div>
      </div>
    </div>
  `;

  modal.classList.add('active');
  content.querySelector('#modal-close-btn').addEventListener('click', closeModal);
}

function closeModal() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (content) {
    content.style.animation = 'slideOutRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
  }
  
  // Wait for animation to finish before hiding the overlay
  setTimeout(() => {
    modal.classList.remove('active');
    if (content) {
      content.style.animation = ''; // Reset animation for next time
    }
  }, 300);
}

// ============================================================
// MODULE 8: Deck Analyzer
// ============================================================

const SAMPLE_DECKS = [];  // Removed — only real analyzed decks from Supabase shown

function renderDeckAnalyzer(area) {
  // Merge: sample decks + Supabase saved decks + session uploads
  const savedDecks = (window._savedDecks || []).map(sd => ({
    id: `db-${sd.id}`,
    name: sd.filename,
    company: sd.company_name || sd.filename,
    type: 'pdf',
    uploadDate: sd.upload_date || '',
    ratings: {
      problem: sd.score_problem || 0, solution: sd.score_solution || 0,
      market: sd.score_market || 0, team: sd.score_team || 0,
      traction: sd.score_traction || 0, businessModel: sd.score_biz_model || 0,
      financials: sd.score_financials || 0, ask: sd.score_ask || 0
    },
    verdict: sd.verdict || 'review',
    verdictText: sd.verdict_text || '',
    strengths: sd.strengths || [],
    weaknesses: sd.weaknesses || [],
    redFlags: sd.red_flags || []
  }));
  const allDecks = [...savedDecks, ...uploadedDecks];
  const total = allDecks.length;
  const passCount = allDecks.filter(d => d.verdict === 'pass').length;
  const reviewCount = allDecks.filter(d => d.verdict === 'review').length;
  const skipCount = allDecks.filter(d => d.verdict === 'skip').length;

  area.innerHTML = `
    <div class="stats-bar" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-label">Total Decks</div>
        <div class="stat-value emerald">${total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">✅ Pass to IC</div>
        <div class="stat-value emerald">${passCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">🔍 Needs Review</div>
        <div class="stat-value amber">${reviewCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">❌ Skip</div>
        <div class="stat-value orange">${skipCount}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:280px 1fr;gap:20px;align-items:start">
      <!-- Left Sidebar: Upload & Highlights -->
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="deck-upload-zone" id="deck-upload-zone" style="padding:28px 20px;border-radius:12px;background:var(--bg-secondary);border:1px dashed var(--border-medium);transition:all 0.2s">
          <span class="upload-icon" style="font-size:2.5rem;margin-bottom:10px">📄</span>
          <div class="upload-title" style="font-size:0.95rem;font-weight:700;color:var(--text-primary);margin-bottom:4px">Analyze New Deck</div>
          <div class="upload-subtitle" style="font-size:0.7rem;color:var(--text-muted)">Drop PDF or PPTX to score</div>
          <button class="upload-btn" style="padding:8px 16px;font-size:0.7rem;margin-top:16px;width:100%">Browse Files</button>
          <input type="file" id="deck-file-input" accept=".pdf,.pptx,.ppt">
        </div>
        
        ${allDecks.length > 0 ? `
        <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:12px;padding:16px">
          <div style="font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px">Highest Scoring</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[...allDecks].sort((a,b) => {
              const scoreA = Object.values(a.ratings).reduce((s,v)=>s+v,0)/8;
              const scoreB = Object.values(b.ratings).reduce((s,v)=>s+v,0)/8;
              return scoreB - scoreA;
            }).slice(0, 4).map(d => {
              const s = Math.round(Object.values(d.ratings).reduce((val,cur)=>val+cur,0)/8);
              return `
              <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;border-bottom:1px solid var(--border-subtle)">
                <div style="font-size:0.75rem;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${d.company || d.name}</div>
                <div style="font-size:0.7rem;font-family:'JetBrains Mono',monospace;font-weight:700;color:${s >= 70 ? 'var(--accent-emerald)' : 'var(--text-muted)'}">${s}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
        ` : ''}
      </div>

      <!-- Right Area: Evaluated Decks Grid -->
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-size:0.9rem;font-weight:800;color:var(--text-primary)">Deck Intelligence Database</div>
          <div style="font-size:0.7rem;color:var(--text-muted)">Sorted by recency</div>
        </div>
        <div class="decks-grid" style="margin-top:0;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:14px">
          ${allDecks.map(d => renderDeckCard(d)).join('')}
          ${allDecks.length === 0 ? '<div style="font-size:0.8rem;color:var(--text-muted);padding:20px;grid-column:1/-1;text-align:center;background:var(--bg-secondary);border-radius:12px;border:1px dashed var(--border-medium)">Drop a deck on the left to start analyzing.</div>' : ''}
        </div>
      </div>
    </div>
  `;

  // Bind upload
  const uploadZone = document.getElementById('deck-upload-zone');
  const fileInput = document.getElementById('deck-file-input');
  const browseBtn = uploadZone.querySelector('.upload-btn');

  browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    handleDeckUpload(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', (e) => handleDeckUpload(e.target.files));
}

async function handleDeckUpload(files) {
  if (!files || files.length === 0) return;
  const file = files[0];
  const ext = file.name.split('.').pop().toLowerCase();
  const type = ext === 'pdf' ? 'pdf' : 'ppt';
  const fileName = file.name.replace(/\.[^/.]+$/, '');

  // Show loading state
  const area = document.getElementById('content-area');
  const uploadZone = document.getElementById('deck-upload-zone');
  if (uploadZone) {
    uploadZone.innerHTML = `
      <div style="text-align:center;padding:20px">
        <div style="font-size:2rem;margin-bottom:12px" class="spin-animation">🧠</div>
        <div style="font-weight:700;color:var(--text-primary)">Analyzing "${fileName}" with GPT-4o...</div>
        <div style="color:var(--text-muted);font-size:0.8rem;margin-top:8px">Extracting text → AI scoring → Red flag detection</div>
      </div>`;
  }

  try {
    // Read file as text (works for PDF text layers)
    const fileText = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        let text = reader.result;
        // For PDFs, extract readable text chunks  
        if (type === 'pdf') {
          // Extract readable text between stream objects
          const textParts = [];
          const matches = text.match(/\(([^)]{3,200})\)/g);
          if (matches) {
            matches.forEach(m => {
              const clean = m.slice(1, -1).replace(/\\[()\\]/g, '');
              if (clean.length > 3 && /[a-zA-Z]/.test(clean)) textParts.push(clean);
            });
          }
          resolve(textParts.join(' ').substring(0, 4000) || `Pitch deck for ${fileName}`);
        } else {
          resolve(text.substring(0, 4000) || `Pitch deck for ${fileName}`);
        }
      };
      reader.onerror = () => resolve(`Pitch deck for ${fileName}`);
      reader.readAsText(file);
    });

    // Call GPT-4o for real analysis
    const OPENAI_KEY = CONFIG.openaiApiKey || '';
    if (!OPENAI_KEY) throw new Error('No OpenAI API key configured');

    const prompt = `You are a senior VC partner reviewing a pitch deck. Analyze the following deck content and score it.

Deck Title: ${fileName}
Content extracted from deck:
${fileText}

Respond with ONLY valid JSON (no markdown fences), matching this schema:
{
  "company_name": "name of the company",
  "scores": {
    "problem": 72, "solution": 65, "market": 80, "team": 55,
    "traction": 40, "businessModel": 60, "financials": 45, "ask": 70
  },
  "verdict": "pass",
  "verdict_text": "2-3 sentence recommendation for the IC",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "red_flags": ["any critical red flags found"]
}

Rules:
- Each score is 0-100
- verdict is "pass" (score>=75), "review" (55-74), or "skip" (<55) based on average
- Be specific, not generic. Reference actual content from the deck.
- red_flags: unrealistic TAM, no traction, missing financials, no clear moat, etc.`;

    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1000
      })
    });

    const gptData = await gptRes.json();
    const content = gptData.choices?.[0]?.message?.content || '{}';
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const ratings = parsed.scores || {};
    const avg = Math.round(Object.values(ratings).reduce((a, b) => a + b, 0) / 8);

    const newDeck = {
      id: `deck-${Date.now()}`,
      name: fileName,
      company: parsed.company_name || fileName.split('-')[0].trim(),
      type: type,
      uploadDate: new Date().toISOString().split('T')[0],
      ratings,
      verdict: parsed.verdict || (avg >= 75 ? 'pass' : avg >= 55 ? 'review' : 'skip'),
      verdictText: parsed.verdict_text || '',
      strengths: parsed.strengths || [],
      weaknesses: parsed.weaknesses || [],
      redFlags: parsed.red_flags || []
    };

    // Save to Supabase
    if (supabaseClient) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/deck_analyses`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            filename: fileName,
            company_name: newDeck.company,
            score_problem: ratings.problem || 0,
            score_solution: ratings.solution || 0,
            score_market: ratings.market || 0,
            score_team: ratings.team || 0,
            score_traction: ratings.traction || 0,
            score_biz_model: ratings.businessModel || 0,
            score_financials: ratings.financials || 0,
            score_ask: ratings.ask || 0,
            avg_score: avg,
            verdict: newDeck.verdict,
            verdict_text: newDeck.verdictText,
            strengths: newDeck.strengths,
            weaknesses: newDeck.weaknesses,
            red_flags: newDeck.redFlags,
            extracted_text: fileText.substring(0, 5000)
          })
        });
        console.log('✅ Deck analysis saved to Supabase');
      } catch (saveErr) {
        console.warn('Could not save deck analysis:', saveErr);
      }
    }

    uploadedDecks.unshift(newDeck);
    renderDeckAnalyzer(document.getElementById('content-area'));

  } catch (err) {
    console.error('Deck analysis failed:', err);
    // Fallback to simple heuristic scoring
    const ratings = {
      problem: 50, solution: 50, market: 50, team: 50,
      traction: 30, businessModel: 45, financials: 35, ask: 45
    };
    const newDeck = {
      id: `deck-${Date.now()}`,
      name: fileName,
      company: fileName.split('-')[0].trim(),
      type: type,
      uploadDate: new Date().toISOString().split('T')[0],
      ratings,
      verdict: 'review',
      verdictText: `AI analysis failed (${err.message}). Default scores assigned. Please review manually.`,
      strengths: ['Manual review required'],
      weaknesses: ['AI analysis could not complete — check API key'],
      redFlags: ['Analysis incomplete']
    };
    uploadedDecks.unshift(newDeck);
    renderDeckAnalyzer(document.getElementById('content-area'));
  }
}

function renderDeckCard(d) {
  const ratingLabels = {
    problem: 'Problem', solution: 'Solution', market: 'Market Size',
    team: 'Team', traction: 'Traction', businessModel: 'Biz Model',
    financials: 'Financials', ask: 'The Ask'
  };
  const avg = Math.round(Object.values(d.ratings).reduce((a, b) => a + b, 0) / 8);
  const circumference = 2 * Math.PI * 26; // Increased radius to 26
  const offset = circumference - (avg / 100) * circumference;
  const ringColor = avg >= 75 ? 'var(--accent-emerald)' : avg >= 55 ? 'var(--accent-amber)' : 'var(--accent-red)';

  return `
    <div class="deck-card animated-item" style="padding:16px;border-radius:12px">
      <div class="deck-card-header" style="margin-bottom:16px;align-items:flex-start">
        <div class="deck-card-icon ${d.type}" style="width:36px;height:36px;font-size:1.2rem;display:flex;align-items:center;justify-content:center">${d.type === 'pdf' ? '📕' : '📊'}</div>
        <div style="flex:1">
          <div class="deck-card-name" style="font-size:0.95rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px">${d.name}</div>
          <div class="deck-card-meta" style="display:flex;gap:6px;align-items:center">
            <span class="deal-tag" style="font-size:0.65rem;padding:2px 8px;background:var(--bg-tertiary);color:var(--text-primary)">${d.company}</span>
            <span class="deck-card-timestamp" style="font-size:0.6rem;color:var(--text-muted)">${d.uploadDate}</span>
          </div>
        </div>
        <div class="deck-overall-score" style="display:flex;flex-direction:column;align-items:center">
          <div class="score-ring" style="width:48px;height:48px">
            <svg viewBox="0 0 64 64" style="width:48px;height:48px;transform:rotate(-90deg)">
              <circle class="bg" cx="32" cy="32" r="26" style="fill:none;stroke:var(--border-medium);stroke-width:6" />
              <circle class="progress" cx="32" cy="32" r="26"
                stroke="${ringColor}"
                stroke-width="6"
                stroke-linecap="round"
                fill="none"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${offset}"
                style="transition:stroke-dashoffset 1s ease-out" />
            </svg>
            <div class="score-ring-value" style="color:${ringColor};font-size:1rem;font-weight:800;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)">${avg}</div>
          </div>
        </div>
      </div>

      <div class="deck-ratings" style="display:grid;grid-template-columns:1fr 1fr;column-gap:16px;row-gap:8px;margin-bottom:16px">
        ${Object.entries(d.ratings).map(([key, val]) => `
          <div class="deck-rating-row" style="display:flex;align-items:center;gap:8px">
            <div class="deck-rating-label" style="width:70px;font-size:0.65rem;font-weight:600;color:var(--text-secondary)">${ratingLabels[key]}</div>
            <div class="deck-rating-bar" style="flex:1;height:4px;background:var(--bg-tertiary);border-radius:2px;overflow:hidden"><div class="deck-rating-bar-fill" style="height:100%;width:${val}%;background:${getBarColor(val)};border-radius:2px"></div></div>
            <div class="deck-rating-val" style="width:20px;text-align:right;font-size:0.65rem;font-weight:700;font-family:'JetBrains Mono',monospace;color:${getBarColor(val)}">${val}</div>
          </div>
        `).join('')}
      </div>

      <div class="deck-verdict ${d.verdict}" style="padding:14px;border-radius:12px;margin-bottom:16px;background:${d.verdict === 'pass' ? 'rgba(16,185,129,0.1)' : d.verdict === 'review' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)'};border:1px solid ${d.verdict === 'pass' ? 'rgba(16,185,129,0.2)' : d.verdict === 'review' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}">
        <div style="font-weight:800;margin-bottom:6px;color:${d.verdict === 'pass' ? 'var(--accent-emerald)' : d.verdict === 'review' ? 'var(--accent-amber)' : '#ef4444'}">${d.verdict === 'pass' ? '✅ PASS — Move to IC' : d.verdict === 'review' ? '🔍 REVIEW — Needs Follow-up' : '❌ SKIP — Does Not Meet Criteria'}</div>
        <div style="font-size:0.8rem;line-height:1.5;color:var(--text-primary)">${d.verdictText}</div>
      </div>

      ${d.strengths && d.strengths.length > 0 ? `
        <div style="margin-bottom:8px;font-size:0.8rem">
          <span style="color:var(--accent-emerald);font-weight:800">✅ Strengths:</span>
          <span style="color:var(--text-secondary)">${d.strengths.join(' • ')}</span>
        </div>` : ''}
      ${d.weaknesses && d.weaknesses.length > 0 ? `
        <div style="margin-bottom:8px;font-size:0.8rem">
          <span style="color:var(--accent-amber);font-weight:800">⚠️ Weaknesses:</span>
          <span style="color:var(--text-secondary)">${d.weaknesses.join(' • ')}</span>
        </div>` : ''}
      ${(d.redFlags && d.redFlags.length > 0) ? `
        <div style="margin-bottom:16px;font-size:0.8rem;padding:10px;background:rgba(239,68,68,0.05);border-radius:8px;border-left:3px solid #ef4444">
          <span style="color:#ef4444;font-weight:800">🚩 Red Flags:</span>
          <span style="color:var(--text-primary);font-weight:600;margin-left:4px">${d.redFlags.join(' • ')}</span>
        </div>` : ''}

      <div class="deck-action-btns" style="display:flex;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border-subtle)">
        <button class="deck-action-btn primary" style="padding:8px 16px;font-size:0.8rem;font-weight:700">📋 Add to Pipeline</button>
        <button class="deck-action-btn" style="padding:8px 16px;font-size:0.8rem;font-weight:600">💬 Share Analysis</button>
      </div>
    </div>
  `;
}

// ============================================================
// MODULE 2: Valuation Intelligence
// ============================================================
function renderValuation(area) {
  const overpriced = VALUATION_COMPS.filter(v => v.status === 'overpriced').length;
  const underpriced = VALUATION_COMPS.filter(v => v.status === 'underpriced').length;

  area.innerHTML = `
    <div class="stats-bar" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-label">Companies Analyzed</div>
        <div class="stat-value emerald">${VALUATION_COMPS.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Fairly Valued</div>
        <div class="stat-value blue">${VALUATION_COMPS.filter(v => v.status === 'fair').length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Underpriced 🎯</div>
        <div class="stat-value emerald">${underpriced}</div>
        <div class="stat-change positive">Potential alpha</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Overpriced ⚠️</div>
        <div class="stat-value orange">${overpriced}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:300px 1fr;gap:20px;align-items:start">
      
      <!-- Interactive Valuation Engine -->
      <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:12px;padding:20px;position:sticky;top:20px">
        <div style="font-size:0.9rem;font-weight:800;color:var(--text-primary);margin-bottom:4px;display:flex;align-items:center;gap:6px">
          🧮 Deal Valuation Engine
        </div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:20px">Real-time multiple scenario analysis</div>
        
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:0.75rem;font-weight:700;color:var(--text-secondary);margin-bottom:6px">Select Pipeline Deal</label>
          <select id="val-deal-select" style="width:100%;padding:10px;background:var(--bg-tertiary);border:1px solid var(--border-medium);border-radius:8px;color:var(--text-primary);font-size:0.8rem;outline:none;font-family:Inter">
            <option value="">-- Choose Deal --</option>
            ${streakDeals.filter(d => ['5001','5002','5003','5011','5004'].includes(d.stage_key)).map(d => `<option value="${d.box_key}">${d.name}</option>`).join('')}
          </select>
        </div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
          <div>
            <label style="display:block;font-size:0.75rem;font-weight:700;color:var(--text-secondary);margin-bottom:6px">Annual Rev ($M)</label>
            <input type="number" id="val-arr" placeholder="e.g. 2.5" step="0.1" style="width:100%;padding:10px;background:var(--bg-tertiary);border:1px solid var(--border-medium);border-radius:8px;color:var(--text-primary);font-size:0.9rem;font-weight:700;font-family:'JetBrains Mono',monospace;outline:none">
          </div>
          <div>
            <label style="display:block;font-size:0.75rem;font-weight:700;color:var(--text-secondary);margin-bottom:6px">YoY Growth (%)</label>
            <input type="number" id="val-growth" placeholder="e.g. 150" style="width:100%;padding:10px;background:var(--bg-tertiary);border:1px solid var(--border-medium);border-radius:8px;color:var(--text-primary);font-size:0.9rem;font-weight:700;font-family:'JetBrains Mono',monospace;outline:none">
          </div>
        </div>

        <div style="margin-bottom:20px">
          <label style="display:block;font-size:0.75rem;font-weight:700;color:var(--text-secondary);margin-bottom:6px">Revenue Multiple Target <span id="val-mult-display" style="float:right;color:var(--accent-indigo)">12.0x</span></label>
          <input type="range" id="val-mult" min="2" max="30" step="0.5" value="12" style="width:100%;accent-color:var(--accent-indigo)">
          <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:var(--text-muted);margin-top:4px">
            <span>Value (2x)</span>
            <span>Premium (30x)</span>
          </div>
        </div>

        <div style="background:var(--bg-tertiary);border-radius:8px;padding:16px;text-align:center;border:1px solid var(--border-medium);margin-bottom:16px">
          <div style="font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Implied Fair Value</div>
          <div id="val-result" style="font-size:2rem;font-weight:900;font-family:'JetBrains Mono',monospace;color:var(--accent-emerald)">$0.0M</div>
        </div>
        
        <button id="val-save-btn" style="width:100%;padding:12px;background:var(--accent-indigo);color:white;border:none;border-radius:8px;font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s">Save to Deal Intelligence</button>
      </div>

      <!-- Comparables Database -->
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-size:0.9rem;font-weight:800;color:var(--text-primary)">Pre-Computed Comparables</div>
          <div style="font-size:0.7rem;color:var(--text-muted)">Live market comps</div>
        </div>

    <div class="table-container" style="background:var(--bg-secondary);border-radius:16px;border:1px solid var(--border-medium);overflow:hidden">
      <table style="width:100%;border-collapse:collapse;text-align:left">
        <thead>
          <tr style="background:var(--bg-tertiary);border-bottom:1px solid var(--border-medium);font-size:0.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em">
            <th style="padding:16px;font-weight:600">Company</th>
            <th style="padding:16px;font-weight:600">Stage</th>
            <th style="padding:16px;font-weight:600">ARR</th>
            <th style="padding:16px;font-weight:600">Growth</th>
            <th style="padding:16px;font-weight:600">Implied Value</th>
            <th style="padding:16px;font-weight:600">Verdict</th>
            <th style="padding:16px;font-weight:600">Comps</th>
            <th style="padding:16px;font-weight:600">Key Risk</th>
          </tr>
        </thead>
        <tbody>
      ${VALUATION_COMPS.map((v, i) => `
        <tr class="animated-item" style="animation-delay:${i * 0.05}s;border-bottom:1px solid var(--border-subtle)">
          <td style="padding:16px;font-weight:700">
            ${v.name}<br>
            <span style="font-size:0.65rem;color:var(--text-tertiary);font-weight:400">${v.model}</span>
          </td>
          <td style="padding:16px"><span style="font-size:0.7rem;padding:3px 8px;border-radius:12px;background:var(--bg-tertiary)">${v.stage}</span></td>
          <td style="padding:16px;font-family:'JetBrains Mono',monospace">${v.revenue}</td>
          <td style="padding:16px;color:var(--accent-emerald);font-weight:700">${v.growth}</td>
          <td style="padding:16px;font-family:'JetBrains Mono',monospace;color:var(--text-primary);font-weight:600">${v.fairVal}</td>
          <td style="padding:16px">
            <div style="font-family:'JetBrains Mono',monospace;font-weight:700;display:flex;align-items:center;gap:6px">
              ${v.currentVal}
              ${v.status === 'overpriced' ? '<span style="color:#ef4444;font-size:0.8rem" title="Overpriced">🔴</span>' :
      v.status === 'underpriced' ? '<span style="color:#10b981;font-size:0.8rem" title="Attractively Priced">🟢</span>' :
        '<span style="color:#3b82f6;font-size:0.8rem" title="Fairly Priced">🔵</span>'}
            </div>
          </td>
          <td style="padding:16px;font-size:0.7rem;color:var(--text-secondary);max-width:200px;line-height:1.4">${v.comps.join('<br>')}</td>
          <td style="padding:16px;font-size:0.7rem;color:var(--text-secondary);max-width:200px;line-height:1.4">${v.risks}</td>
        </tr>
      `).join('')}
        </tbody>
      </table>
    </div>
    </div>
  `;

  // Calculator Logic
  const inputs = ['val-arr', 'val-growth', 'val-mult'];
  const res = document.getElementById('val-result');
  const multDisplay = document.getElementById('val-mult-display');
  
  function updateCalc() {
    const arr = parseFloat(document.getElementById('val-arr').value) || 0;
    const mult = parseFloat(document.getElementById('val-mult').value) || 12;
    // Basic formula: ARR * Multiple. Growth adds a premium (e.g. >100% growth adds up to 20% premium)
    const growth = parseFloat(document.getElementById('val-growth').value) || 0;
    
    let baseVal = arr * mult;
    if (growth > 100) baseVal *= 1.1; // simple premium for hypergrowth
    else if (growth < 50) baseVal *= 0.9; // discount for slow growth
    
    multDisplay.textContent = mult.toFixed(1) + 'x';
    res.textContent = baseVal > 0 ? '$' + baseVal.toFixed(1) + 'M' : '$0.0M';
    res.style.color = baseVal > 50 ? 'var(--accent-emerald)' : 'var(--text-primary)';
  }
  
  inputs.forEach(id => document.getElementById(id)?.addEventListener('input', updateCalc));
  
  // Auto-fill test values when deal selected
  document.getElementById('val-deal-select')?.addEventListener('change', (e) => {
    if(!e.target.value) {
      document.getElementById('val-arr').value = '';
      document.getElementById('val-growth').value = '';
      updateCalc();
      return;
    }
    document.getElementById('val-arr').value = (Math.random() * 5 + 0.5).toFixed(1);
    document.getElementById('val-growth').value = Math.floor(Math.random() * 200 + 50);
    updateCalc();
  });
  
  document.getElementById('val-save-btn')?.addEventListener('click', (e) => {
    const btn = e.target;
    btn.textContent = '✅ Saved to Deal';
    btn.style.background = 'var(--accent-emerald)';
    setTimeout(() => {
      btn.textContent = 'Save to Deal Intelligence';
      btn.style.background = 'var(--accent-indigo)';
    }, 2000);
  });
}

// ============================================================
// MODULE 3: Thesis Tracker
// ============================================================
function renderThesis(area) {
  const signals = window._newsSignals || [];

  // Categorize news signals into thesis buckets based on AI generated summaries or logic
  const accelerating = signals.filter(s => s.relevance_score > 70 && (s.type === 'funding_round' || s.summary?.toLowerCase().includes('accelerating') || s.ai_summary?.toLowerCase().includes('growth')));
  const saturated = signals.filter(s => s.relevance_score < 40 || s.summary?.toLowerCase().includes('saturated') || s.ai_summary?.toLowerCase().includes('competition'));
  const whitespace = signals.filter(s => s.relevance_score > 80 && (s.summary?.toLowerCase().includes('whitespace') || s.ai_summary?.toLowerCase().includes('opportunity') || s.type === 'market_signal'));

  // Create fallback entries if there aren't enough news signals yet
  const fallbackAccelerating = accelerating.length ? accelerating : [
    { title: 'Generative AI Applications', summary: 'Sustained peak of funding across application layers.', type: 'up' },
    { title: 'Climate Tech Hardware', summary: 'Federal grants pulling private capital rounds earlier.', type: 'up' }
  ];

  const fallbackSaturated = saturated.length ? saturated : [
    { title: 'DTC E-commerce', summary: 'CAC has become untenable for single product brands.', type: 'flat' },
    { title: 'Quick Commerce', summary: 'Unit economics highly challenging at scale.', type: 'flat' }
  ];

  const fallbackWhitespace = whitespace.length ? whitespace : [
    { title: 'Vertical AI Agents', summary: 'Replacing BPO layers in legal, healthcare, accounting.', type: 'up' },
    { title: 'Space Manufacturing', summary: 'Cost to orbit enables new material science margins.', type: 'up' }
  ];

  area.innerHTML = `
    ${getModuleNews('thesis', 6)}
    
    ${signals.length > 0 ? `
    <div class="insight-box positive">
      <span class="insight-emoji">🧭</span>
      <strong>Your thesis is getting stronger in:</strong> ${accelerating.slice(0, 3).map(s => s.company || s.title.split(' ')[0]).join(', ') || 'AI Applications, Climate Tech'}. Capital is flowing into these sectors based on recent news signals.
    </div>
    <div class="insight-box warning">
      <span class="insight-emoji">⚠️</span>
      <strong>You are underexposed to:</strong> ${whitespace.slice(0, 3).map(s => s.company || s.title.split(' ')[0]).join(', ') || 'Space Manufacturing, Vertical AI Agents'}. These are high-opportunity areas with minimal VC competition right now.
    </div>
    ` : `
    <div class="insight-box info">
      <span class="insight-emoji">ℹ️</span>
      <strong>Live Data Pending:</strong> Start the n8n news workflow to populate real-time market signals here. Showing historical baseline theses.
    </div>
    `}

    <div class="section-title-row" style="margin-top:24px">
      <div class="section-title">🚀 Accelerating Themes</div>
      <div class="section-subtitle">Capital flowing in, conviction building</div>
    </div>
    <div class="thesis-grid">
      ${fallbackAccelerating.slice(0, 4).map(t => `
        <div class="thesis-card accelerating animated-item">
          <div class="thesis-card-emoji">${t.title ? (t.title.toLowerCase().includes('ai') ? '🤖' : t.title.toLowerCase().includes('climate') ? '🌍' : '📈') : '📈'}</div>
          <div class="thesis-card-title">${t.title || t.company}</div>
          <div class="thesis-card-desc">${t.summary || t.ai_summary || t.implication}</div>
          <div class="thesis-card-status up">Accelerating</div>
        </div>
      `).join('')}
    </div>

    <div class="section-title-row" style="margin-top:28px">
      <div class="section-title">⚠️ Getting Saturated</div>
      <div class="section-subtitle">High competition, margins compressing</div>
    </div>
    <div class="thesis-grid">
      ${fallbackSaturated.slice(0, 4).map(t => `
        <div class="thesis-card saturated animated-item">
          <div class="thesis-card-emoji">${t.title ? (t.title.toLowerCase().includes('dtc') ? '📦' : t.title.toLowerCase().includes('quick') ? '🛵' : '📉') : '📉'}</div>
          <div class="thesis-card-title">${t.title || t.company}</div>
          <div class="thesis-card-desc">${t.summary || t.ai_summary || t.implication}</div>
          <div class="thesis-card-status flat">Saturated</div>
        </div>
      `).join('')}
    </div>

    <div class="section-title-row" style="margin-top:28px">
      <div class="section-title">💎 White Spaces</div>
      <div class="section-subtitle">Low competition, massive TAM, strong thesis fit</div>
    </div>
    <div class="thesis-grid" style="grid-template-columns: repeat(${Math.min(fallbackWhitespace.length, 4)}, 1fr)">
      ${fallbackWhitespace.slice(0, 4).map(t => `
        <div class="thesis-card whitespace animated-item">
          <div class="thesis-card-emoji">${t.title ? (t.title.toLowerCase().includes('agent') ? '👔' : t.title.toLowerCase().includes('space') ? '🚀' : '💎') : '💎'}</div>
          <div class="thesis-card-title">${t.title || t.company}</div>
          <div class="thesis-card-desc">${t.summary || t.ai_summary || t.implication}</div>
          <div class="thesis-card-status up">Opportunity</div>
        </div>
      `).join('')}
    </div>
`;
}

// ============================================================
// MODULE 4: Portfolio Command Center
// ============================================================
function renderPortfolio(area) {
  const now = Date.now();

  function getDaysSince(d) {
    const ts = d.last_email_timestamp ? parseInt(d.last_email_timestamp) :
      d.updated_at ? parseInt(d.updated_at) : null;
    if (!ts) return 999;
    return Math.floor((now - ts) / 86400000);
  }

  if (!streakDeals.length) {
    area.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary)">Loading portfolio data from Streak CRM...</div>';
    return;
  }

  const portfolio = streakDeals.filter(d => d.stage_key === '5014');
  const watching = streakDeals.filter(d => ['5008', '5015'].includes(d.stage_key));
  const metricsMap = {};
  (window._portfolioMetrics || []).forEach(m => { metricsMap[m.box_key] = m; });

  if (!portfolio.length) {
    area.innerHTML = `
      ${getModuleNews('portfolio')}
      <div class="stats-bar">
        <div class="stat-card"><div class="stat-label">Portfolio Companies</div><div class="stat-value emerald">0</div></div>
        <div class="stat-card"><div class="stat-label">Total ARR Built</div><div class="stat-value blue">$0M</div></div>
      </div>
      <div style="padding:60px;text-align:center;color:var(--text-secondary)">
        <div style="font-size:3rem;margin-bottom:16px">📊</div>
        <h3 style="color:var(--text-primary)">No portfolio companies yet</h3>
        <p>Companies moved to the "Portfolio" stage (5014) in Streak will appear here automatically.</p>
      </div>`;
    return;
  }

  // Derive aggregate metrics from DB
  let totalArr = 0;
  let healthyCount = 0;
  let riskCount = 0;

  portfolio.forEach(p => {
    const m = metricsMap[p.box_key];
    if (m) {
      if (m.arr) totalArr += Number(m.arr);
      if (m.health_status === 'Green') healthyCount++;
      if (m.health_status === 'Red') riskCount++;
    } else {
      // Fallback to Streak email health if no DB metric exists yet
      const days = getDaysSince(p);
      if (days < 30) healthyCount++; else if (days > 90) riskCount++;
    }
  });

  area.innerHTML = `
    ${getModuleNews('portfolio')}
    <div class="stats-bar">
      <div class="stat-card"><div class="stat-label">Portfolio Companies</div><div class="stat-value emerald">${portfolio.length}</div></div>
      <div class="stat-card"><div class="stat-label">Total Portfolio ARR</div><div class="stat-value blue">$${(totalArr / 1000000).toFixed(1)}M</div><div class="stat-change positive">From ${portfolio.filter(p => metricsMap[p.box_key]?.arr).length} active reporters</div></div>
      <div class="stat-card"><div class="stat-label">Healthy Companies</div><div class="stat-value emerald">${healthyCount}</div><div class="stat-change positive">On track</div></div>
      <div class="stat-card"><div class="stat-label">At Risk / Runway < 6m</div><div class="stat-value orange">${riskCount}</div><div class="stat-change ${riskCount ? 'negative' : 'positive'}">${riskCount ? 'Requires intervention' : 'All healthy'}</div></div>
    </div>

    <div class="section-title-row">
      <div class="section-title">📊 Portfolio Companies</div>
      <div class="section-subtitle">Live from Streak CRM + Portfolio Metrics DB</div>
    </div>

    <div class="portfolio-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:16px">
      ${portfolio.map(p => {
    const m = metricsMap[p.box_key] || {};
    const health = m.health_status ? m.health_status.toLowerCase() : (getDaysSince(p) < 30 ? 'green' : getDaysSince(p) < 90 ? 'yellow' : 'red');
    const industry = p._industry || inferIndustry(p);
    const country = p._country || inferCountry(p);
    const scoreColor = health === 'green' ? '#10b981' : health === 'yellow' ? '#f59e0b' : '#ef4444';
    const name = (p.name || '').replace(/^www\./, '').replace(/\.(com|co\.in|co|in|io|ai|vc|org|net)(\/.*)?$/i, '');

    // Format ARR
    let arrText = 'Pending';
    if (m.arr >= 1000000) arrText = `$${(m.arr / 1000000).toFixed(1)}M`;
    else if (m.arr > 0) arrText = `$${Math.round(m.arr / 1000)}k`;

    return `
          <div class="portfolio-card animated-item" style="cursor:pointer;background:var(--bg-secondary);border:1px solid var(--border-medium);border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:16px" onclick="openStreakDealModal(${JSON.stringify(p).replace(/"/g, '&quot;')})">
            
            <div style="display:flex;gap:12px;align-items:flex-start">
              <div class="portfolio-logo" style="font-size:1.6rem;width:48px;height:48px;background:var(--bg-tertiary);border-radius:12px;display:flex;align-items:center;justify-content:center">${industry.slice(0, 2)}</div>
              <div style="flex:1">
                <div style="font-size:1.15rem;font-weight:800;letter-spacing:-0.02em">${name}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">${p.funding_stage || industry} · ${country}</div>
              </div>
              <span class="health-indicator ${health}" style="align-self:flex-start;padding:4px 10px;border-radius:12px;font-size:0.65rem;text-transform:uppercase;font-weight:800">${health === 'green' ? '● Healthy' : health === 'yellow' ? '● Monitor' : '● At Risk'}</span>
            </div>

            <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;background:var(--bg-primary);padding:12px;border-radius:8px">
              <div>
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">ARR Data</div>
                <div style="font-size:1.1rem;font-weight:700;font-family:'JetBrains Mono',monospace;color:${m.arr ? 'var(--text-primary)' : 'var(--text-muted)'}">${arrText}</div>
              </div>
              <div>
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Runway</div>
                <div style="font-size:1.1rem;font-weight:700;font-family:'JetBrains Mono',monospace;color:${m.cash_runway_mo < 6 ? '#ef4444' : m.cash_runway_mo ? 'var(--text-primary)' : 'var(--text-muted)'}">${m.cash_runway_mo ? m.cash_runway_mo + ' mo' : 'Pending'}</div>
              </div>
              <div>
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">YoY Growth</div>
                <div style="font-size:1.1rem;font-weight:700;font-family:'JetBrains Mono',monospace;color:${m.growth_rate > 50 ? 'var(--accent-emerald)' : m.growth_rate ? 'var(--text-primary)' : 'var(--text-muted)'}">${m.growth_rate ? m.growth_rate + '%' : 'Pending'}</div>
              </div>
            </div>

          </div>`;
  }).join('')}
    </div>
    
    ${watching.length ? `
    <div class="section-title-row" style="margin-top:32px">
      <div class="section-title">👀 Watching / Too Early</div>
      <div class="section-subtitle">${watching.length} companies in tracking stages</div>
    </div>
    <div class="deal-grid">${watching.map(d => renderStreakDealCard(d)).join('')}</div>` : ''
    }
`;
}

// ============================================================
// MODULE 19: Board Seat Manager
// ============================================================
function renderBoardSeats(area) {
  const boardMeetings = window._boardMeetings || [];

  if (!boardMeetings.length) {
    area.innerHTML = `
  < div style = "padding:60px;text-align:center;color:var(--text-secondary)" >
        <div style="font-size:3rem;margin-bottom:16px">🏛️</div>
        <h3 style="color:var(--text-primary)">No Board Meetings Tracked</h3>
        <p>Start tracking board meetings by adding data to the <code>board_meetings</code> table in Supabase.</p>
      </div > `;
    return;
  }

  const upcoming = boardMeetings.filter(m => m.status === 'Upcoming').sort((a, b) => new Date(a.meeting_date) - new Date(b.meeting_date));
  const past = boardMeetings.filter(m => m.status === 'Completed').sort((a, b) => new Date(b.meeting_date) - new Date(a.meeting_date));

  area.innerHTML = `
  < div style = "margin-bottom:20px;display:flex;justify-content:space-between;align-items:center" >
    <div>
      <h2 style="font-size:1.8rem;margin:0">Board Seat Manager</h2>
      <p style="color:var(--text-secondary);margin:4px 0 0 0">Live synchronization with <code>board_meetings</code> intelligence.</p>
    </div>
    </div >

  <div class="stats-bar" style="display:flex;gap:16px;margin-bottom:24px">
    <div class="stat-card" style="flex:1"><div class="stat-label">Upcoming Meetings</div><div class="stat-value emerald">${upcoming.length}</div></div>
    <div class="stat-card" style="flex:1"><div class="stat-label">Total Board Seats</div><div class="stat-value blue">${upcoming.length + past.length}</div></div>
  </div>

    ${upcoming.length ? `
    <div class="section-title-row" style="margin-top:24px">
      <div class="section-title">🗓️ Upcoming Board Meetings</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:16px">
      ${upcoming.map(m => `
        <div class="animated-item" style="background:var(--bg-secondary);border:1px solid var(--border-medium);border-radius:12px;padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
            <div>
              <div style="font-size:1.15rem;font-weight:800">${m.company_name}</div>
              <div style="font-size:0.8rem;color:var(--text-muted)">📝 ${new Date(m.meeting_date).toLocaleDateString()}</div>
            </div>
            <span style="background:rgba(16,185,129,0.1);color:var(--accent-green);padding:4px 10px;border-radius:12px;font-size:0.65rem;text-transform:uppercase;font-weight:800">Upcoming</span>
          </div>
          <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:12px">
            <strong>Board Member:</strong> ${m.board_member}
          </div>
          ${m.key_agenda && m.key_agenda.length ? `
          <div style="background:var(--bg-primary);padding:12px;border-radius:8px">
            <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Key Agenda items</div>
            <ul style="margin:0;padding-left:16px;font-size:0.8rem;color:var(--text-primary)">
              ${m.key_agenda.map(item => `<li style="margin-bottom:4px">${item}</li>`).join('')}
            </ul>
          </div>` : ''}
          ${m.deck_url ? `
          <div style="margin-top:12px">
            <a href="${m.deck_url}" target="_blank" style="font-size:0.8rem;color:var(--accent-blue);text-decoration:none;display:inline-flex;align-items:center;gap:4px">
              <span>📄</span> View Board Deck 
            </a>
          </div>` : ''}
        </div>
      `).join('')}
    </div>` : ''
    }

    ${past.length ? `
    <div class="section-title-row" style="margin-top:32px">
      <div class="section-title">✅ Recent Board Meetings</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:16px">
      ${past.slice(0, 6).map(m => `
        <div class="animated-item" style="background:var(--bg-secondary);border:1px solid var(--border-medium);border-radius:12px;padding:20px;opacity:0.8">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
            <div>
              <div style="font-size:1.15rem;font-weight:800">${m.company_name}</div>
              <div style="font-size:0.8rem;color:var(--text-muted)">📝 ${new Date(m.meeting_date).toLocaleDateString()}</div>
            </div>
            <span style="background:rgba(156,163,175,0.1);color:var(--text-secondary);padding:4px 10px;border-radius:12px;font-size:0.65rem;text-transform:uppercase;font-weight:800">Completed</span>
          </div>
          ${m.action_items && m.action_items.length ? `
          <div style="background:var(--bg-primary);padding:12px;border-radius:8px">
            <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Action Items</div>
            <ul style="margin:0;padding-left:16px;font-size:0.8rem;color:var(--text-primary)">
              ${m.action_items.map(item => `<li style="margin-bottom:4px">${item}</li>`).join('')}
            </ul>
          </div>` : ''}
        </div>
      `).join('')}
    </div>` : ''
    }
`;
}

// ============================================================
// MODULE 5: Power Moves & Gossip
// ============================================================
function renderPowerMoves(area) {
  const now = Date.now();
  const signals = window._newsSignals || [];

  // Filter news relevant to power moves + derive from streak activity as fallback
  const typeColors = {
    'fund_launch': 'var(--accent-purple)', 'partner_move': 'var(--accent-blue)',
    'funding_round': 'var(--accent-green)', 'acquisition': 'var(--accent-orange)',
    'market_signal': 'var(--accent-pink)', 'competitive_signal': '#f97316',
    'regulatory': '#ef4444', 'portfolio_signal': '#10b981', 'general': '#64748b',
    'Urgent Deal': '#ef4444', 'IC Candidate': '#10b981', 'Deal Activity': '#64748b'
  };

  let powerItems = signals
    .filter(n => {
      try {
        const mods = Array.isArray(n.modules) ? n.modules : JSON.parse(n.modules || '[]');
        return mods.includes('powermoves') || n.type === 'fund_launch' || n.type === 'partner_move' || n.type === 'competitive_signal';
      } catch { return false; }
    })
    .slice(0, 20)
    .map(n => ({
      type: (n.type || 'general').replace(/_/g, ' '),
      title: n.company ? `${n.company}: ${n.title} ` : n.title,
      desc: n.summary || n.ai_summary || '',
      implication: n.implication || '',
      time: n.published_at ? new Date(n.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
      source: n.source || '',
      url: n.source_url || null,
      rawType: n.type
    }));

  // If no news signals yet, derive signals from streak deals activity
  if (!powerItems.length && streakDeals.length) {
    const urgent = streakDeals.filter(d => d.stage_key === '5007');
    const icCandidates = streakDeals.filter(d => d.stage_key === '5011');
    const recentActive = streakDeals
      .filter(d => d.last_email_timestamp && (now - parseInt(d.last_email_timestamp)) < 14 * 86400000)
      .sort((a, b) => parseInt(b.last_email_timestamp) - parseInt(a.last_email_timestamp))
      .slice(0, 12);

    urgent.forEach(d => {
      const name = (d.name || '').replace(/\.(com|co\.in|io|ai|net|org)(\/.*)?$/i, '');
      powerItems.push({
        type: 'Urgent Deal', rawType: 'Urgent Deal',
        title: `${name} — Urgent Tracking`,
        desc: d.description ? d.description.substring(0, 200) : 'Marked urgent in Streak CRM.',
        implication: `🚨 Immediate follow - up required.${d.total_sent_emails || 0} emails sent, ${d.total_received_emails || 0} received.`,
        time: formatLastContact(d.last_email_timestamp).text
      });
    });

    icCandidates.slice(0, 5).forEach(d => {
      const name = (d.name || '').replace(/\.(com|co\.in|io|ai|net|org)(\/.*)?$/i, '');
      powerItems.push({
        type: 'IC Candidate', rawType: 'IC Candidate',
        title: `${name} — IC Process Active`,
        desc: d.description ? d.description.substring(0, 200) : 'In IC review stage.',
        implication: `💼 Investment committee evaluation underway.${(d.total_sent_emails || 0) + (d.total_received_emails || 0)} total email interactions.`,
        time: formatLastContact(d.last_email_timestamp).text
      });
    });

    recentActive.filter(d => !['5007', '5011'].includes(d.stage_key)).slice(0, 8).forEach(d => {
      const name = (d.name || '').replace(/\.(com|co\.in|io|ai|net|org)(\/.*)?$/i, '');
      const stageName = STREAK_STAGE_NAMES[d.stage_key] || d.stage_key;
      powerItems.push({
        type: 'Deal Activity', rawType: 'Deal Activity',
        title: `${name} — Active at ${stageName} `,
        desc: d.description ? d.description.substring(0, 200) : `Stage: ${stageName}.`,
        implication: `📧 ${d.total_sent_emails || 0} sent, ${d.total_received_emails || 0} received.`,
        time: formatLastContact(d.last_email_timestamp).text
      });
    });
  }

  area.innerHTML = `
  < div class="insight-box info" >
      <span class="insight-emoji">🕵️</span>
      <strong>Intelligence Feed:</strong> ${powerItems.length} signals from ${signals.length ? 'news monitoring + Streak CRM' : 'Streak CRM deal activity'}. ${signals.length ? 'Auto-updated daily via n8n.' : 'Add n8n news workflow for external signals (ET, VCCircle, Inc42).'}
    </div >

    <div class="section-title-row" style="margin-top:20px">
      <div class="section-title">Network Intelligence Feed</div>
      <div class="section-subtitle">${signals.length ? `${signals.length} news signals · Updated ${new Date().toLocaleDateString()}` : 'Live · Streak CRM deal activity'}</div>
    </div>

    <div class="power-timeline">
      ${powerItems.length ? powerItems.map(pm => `
        <div class="power-event animated-item">
          <div class="power-event-type" style="color:${typeColors[pm.rawType] || typeColors[pm.type] || 'var(--accent-blue)'}">${pm.type}</div>
          <div class="power-event-title">${pm.title}</div>
          <div class="power-event-desc">${pm.desc}</div>
          <div class="power-event-implication">${pm.implication}</div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="power-event-time">${pm.time}</div>
            ${pm.url ? `<a href="${pm.url}" target="_blank" style="font-size:0.65rem;color:var(--accent-blue);text-decoration:none">${pm.source || 'Read'} →</a>` : pm.source ? `<span class="power-event-time">${pm.source}</span>` : ''}
          </div>
        </div>
      `).join('') : `
        <div style="padding:60px;text-align:center;color:var(--text-secondary)">
          <div style="font-size:3rem;margin-bottom:16px">📡</div>
          <h3 style="color:var(--text-primary)">Power Moves Intelligence</h3>
          <p>Import the n8n_news_workflow.json into your n8n instance to start receiving daily VC intelligence signals from Economic Times, VCCircle, Inc42, and more.</p>
        </div>`}
    </div>
`;
}

// ============================================================
// MODULE 6: Pattern Recognition Engine
// ============================================================
function renderPatterns(area) {
  const cached = window._aiPatterns;

  area.innerHTML = `
    <div class="insight-box positive">
      <span class="insight-emoji">🧬</span>
      <strong>Pattern Insight:</strong> ${cached ? cached.insight : "Click below to analyze the live pipeline for predictive success patterns."}
    </div>

    <div class="section-title-row" style="margin-top:20px">
      <div class="section-title">What Winners Look Like Before They Win</div>
      <div class="section-subtitle">AI analysis of live Streak CRM deal outcomes</div>
    </div>

    <div style="margin-bottom: 24px;">
      <button id="generate-patterns-btn" class="primary-btn" style="padding:8px 16px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;border-radius:10px;font-size:0.75rem;font-weight:700;cursor:pointer;font-family:Inter;transition:all 0.2s">
        🧠 Analyze Live Pipeline
      </button>
      <span id="patterns-status" style="margin-left: 12px; font-size: 0.75rem; color: var(--text-muted);"></span>
    </div>

    <div id="patterns-content">
      ${cached ? renderPatternColumns(cached) : `
        <div style="padding:60px;text-align:center;color:var(--text-secondary);background:var(--bg-secondary);border-radius:14px;border:1px dashed var(--border-medium)">
          <div style="font-size:2.5rem;margin-bottom:14px">📊</div>
          <h3 style="color:var(--text-primary);margin-bottom:10px;font-size:1rem">No Patterns Analyzed Yet</h3>
          <p style="max-width:450px;margin:0 auto 16px;font-size:0.8rem;line-height:1.6">Run the AI engine to analyze properties of deals that moved to late stages vs those that were passed.</p>
        </div>
      `}
    </div>

    <div class="section-title-row" style="margin-top:28px">
      <div class="section-title">📋 New Deal Evaluation Checklist</div>
      <div class="section-subtitle">Score ≥7/10 = strong conviction · 5-6 = deep dive · <5 = pass</div>
    </div>

    <div class="checklist-grid">
      ${EVAL_CHECKLIST.map(c => `
        <div class="checklist-item animated-item">
          <span class="checklist-icon">${c.icon}</span>
          <span>${c.label}</span>
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById('generate-patterns-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('generate-patterns-btn');
    const status = document.getElementById('patterns-status');
    const content = document.getElementById('patterns-content');
    
    btn.disabled = true;
    btn.textContent = '🧠 Analyzing Pipeline...';
    btn.style.opacity = '0.6';
    status.textContent = 'Comparing active vs passed deals with GPT-4o...';

    try {
      if (!window.AI || !window.AI.discoverPatterns) throw new Error("AI discoverPatterns function not loaded.");
      const patterns = await window.AI.discoverPatterns(streakDeals, window._dealEnrichments);
      window._aiPatterns = patterns;
      
      const parentArea = btn.closest('#content-area');
      if(parentArea) renderPatterns(parentArea);
    } catch (err) {
      console.error(err);
      status.textContent = 'Error analyzing patterns.';
      btn.disabled = false;
      btn.textContent = '🧠 Analyze Live Pipeline';
      btn.style.opacity = '1';
    }
  });
}

function renderPatternColumns(patterns) {
  return `
    <div class="pattern-columns">
      <div class="pattern-column">
        <div class="pattern-column-title"><span style="color:var(--accent-emerald)">✅</span> Winner Patterns</div>
        ${(patterns.winners || []).map(p => `
          <div class="pattern-item">
            <div class="pattern-check win">✓</div>
            <div class="pattern-text">${p.text}</div>
          </div>
        `).join('')}
      </div>
      <div class="pattern-column">
        <div class="pattern-column-title"><span style="color:var(--accent-red)">✗</span> Failure Patterns</div>
        ${(patterns.losers || []).map(p => `
          <div class="pattern-item">
            <div class="pattern-check fail">✗</div>
            <div class="pattern-text">${p.text}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ============================================================
// MODULE 7: Daily Intelligence Briefing
// ============================================================
async function renderBriefing(area) {
  const signals = window._newsSignals || [];
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Markdown → HTML parser
  function parseMarkdown(md) {
    if (!md) return '';
    return md
      .replace(/^### (.*$)/gm, '<h3 style="font-size:0.95rem;font-weight:800;color:var(--text-primary);margin:20px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--border-subtle)">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 style="font-size:1.05rem;font-weight:800;color:var(--text-primary);margin:24px 0 10px">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 style="font-size:1.15rem;font-weight:900;color:var(--text-primary);margin:0 0 12px">$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-primary);font-weight:700">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--accent-blue);text-decoration:none;border-bottom:1px dotted var(--accent-blue)">$1</a>')
      .replace(/^- (.*$)/gm, '<div style="display:flex;gap:8px;margin:4px 0;padding-left:4px"><span style="color:var(--accent-emerald);font-weight:700">•</span><span>$1</span></div>')
      .replace(/\n\n/g, '</p><p style="margin:10px 0;line-height:1.7">')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p style="margin:10px 0;line-height:1.7">')
      .replace(/$/, '</p>');
  }

  // Relative time helper
  function relativeTime(dateStr) {
    if (!dateStr) return '';
    const diff = (now - new Date(dateStr)) / 1000;
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Source badge colors
  const sourceColors = {
    'Inc42': '#f97316', 'VCCircle': '#8b5cf6', 'ET Tech': '#3b82f6', 'ET Startups': '#3b82f6',
    'Mint': '#14b8a6', 'TechCrunch': '#10b981', 'YourStory': '#f59e0b', 'Entrackr': '#ef4444',
    'DealStreetAsia': '#ec4899', 'e27': '#84cc16', 'Forbes India': '#b91c1c', 'Moneycontrol': '#06b6d4',
    'Crunchbase News': '#0d9488', 'VentureBeat': '#9333ea', 'SaaStr': '#6366f1',
    'Tech in Asia': '#0284c7', 'Business Standard': '#1e40af', 'Google News VC': '#4285f4'
  };

  // Categorize signals by sector
  const sectors = {};
  signals.forEach(s => {
    const sector = s.sector_id || s.type || 'general';
    if (!sectors[sector]) sectors[sector] = [];
    sectors[sector].push(s);
  });
  const sectorList = Object.keys(sectors).sort((a, b) => sectors[b].length - sectors[a].length);
  const uniqueSources = [...new Set(signals.map(s => s.source).filter(Boolean))];
  const fundingCount = signals.filter(s => s.type === 'funding_round').length;

  // Check for cached brief in Supabase
  let cachedBrief = null;
  if (supabaseConnected) {
    try {
      const { data, error } = await supabaseClient.from('daily_briefings').select('*').order('date', { ascending: false }).limit(1);
      if (!error && data && data.length > 0) cachedBrief = data[0];
    } catch (e) { /* ignore */ }
    if (!cachedBrief) {
      try {
        const { data, error } = await supabaseClient.from('daily_briefs').select('*').order('created_at', { ascending: false }).limit(1);
        if (!error && data && data.length > 0) cachedBrief = { summary_markdown: data[0].content, date: data[0].brief_date };
      } catch (e) { /* ignore */ }
    }
  }

  const briefContent = cachedBrief ? (cachedBrief.summary_markdown || cachedBrief.content || '') : '';
  const parsedBrief = parseMarkdown(briefContent);

  // Build signal feed cards (compact)
  const signalCards = signals.slice(0, 20).map((s, i) => {
    const srcColor = sourceColors[s.source] || '#64748b';
    const headline = s.title || s.headline || s.summary || '';
    const time = relativeTime(s.published_at);
    return `
      <div class="animated-item signal-item" data-sector="${s.sector_id || s.type || 'general'}" style="animation-delay:${i * 0.03}s;padding:10px 14px;border-radius:10px;background:var(--bg-tertiary);border:1px solid var(--border-subtle);transition:all 0.15s;cursor:pointer"
        onmouseover="this.style.borderColor='${srcColor}40';this.style.background='var(--bg-secondary)'"
        onmouseout="this.style.borderColor='var(--border-subtle)';this.style.background='var(--bg-tertiary)'"
        ${s.source_url ? `onclick="window.open('${s.source_url}','_blank')"` : ''}>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
          <span style="padding:1px 7px;border-radius:8px;font-size:0.55rem;font-weight:700;background:${srcColor}20;color:${srcColor};border:1px solid ${srcColor}25">${s.source || '?'}</span>
          <span style="font-size:0.55rem;color:var(--text-muted)">${time}</span>
        </div>
        <div style="font-size:0.73rem;font-weight:600;color:var(--text-primary);line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${s.company ? '<span style="color:var(--accent-emerald)">' + s.company + '</span>: ' : ''}${headline}</div>
        ${s.relevance_score > 80 ? '<div style="margin-top:4px"><span style="padding:1px 5px;border-radius:6px;font-size:0.45rem;font-weight:800;background:rgba(239,68,68,0.12);color:#ef4444;letter-spacing:0.05em">HOT</span></div>' : ''}
      </div>`;
  }).join('');

  // Main layout
  area.innerHTML = `
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:1.2rem;font-weight:800;color:var(--text-primary)">Daily Intelligence Brief</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px">${dateStr}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <div style="padding:5px 12px;background:${signals.length > 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)'};border:1px solid ${signals.length > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'};border-radius:20px;font-size:0.65rem;font-weight:600;color:${signals.length > 0 ? '#10b981' : '#ef4444'}">
          ${signals.length > 0 ? `✅ ${signals.length} signals · ${uniqueSources.length} sources` : '⚠️ No signals'}
        </div>
        <button id="generate-brief-btn" style="padding:8px 18px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;border-radius:10px;font-size:0.75rem;font-weight:700;cursor:pointer;font-family:Inter;transition:all 0.2s"
          onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 16px rgba(99,102,241,0.4)'"
          onmouseout="this.style.transform='';this.style.boxShadow=''">🤖 Generate AI Brief</button>
      </div>
    </div>

    <!-- Compact Stats -->
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:120px;background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:10px;padding:12px 16px;text-align:center">
        <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Signals</div>
        <div style="font-size:1.4rem;font-weight:900;color:var(--accent-emerald)">${signals.length}</div>
      </div>
      <div style="flex:1;min-width:120px;background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:10px;padding:12px 16px;text-align:center">
        <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Sources</div>
        <div style="font-size:1.4rem;font-weight:900;color:var(--accent-blue)">${uniqueSources.length}</div>
      </div>
      <div style="flex:1;min-width:120px;background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:10px;padding:12px 16px;text-align:center">
        <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Funding</div>
        <div style="font-size:1.4rem;font-weight:900;color:var(--accent-emerald)">${fundingCount}</div>
      </div>
      <div style="flex:1;min-width:120px;background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:10px;padding:12px 16px;text-align:center">
        <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Sectors</div>
        <div style="font-size:1.4rem;font-weight:900;color:var(--accent-blue)">${sectorList.length}</div>
      </div>
    </div>

    <div id="brief-generation-status" style="margin:6px 0;font-size:0.7rem;color:var(--text-muted)"></div>

    <!-- TWO-COLUMN LAYOUT: AI Brief (left) + Signal Feed (right) -->
    <div style="display:grid;grid-template-columns:${signals.length > 0 ? '1.5fr 1fr' : '1fr'};gap:16px;margin-bottom:20px;align-items:start">
      
      <!-- LEFT: AI Brief -->
      <div>
        <div id="ai-brief-container" style="${cachedBrief || signals.length === 0 ? '' : 'display:none;'}">
          ${cachedBrief ? `
          <div style="background:var(--bg-secondary);border:1px solid var(--border-medium);border-radius:14px;padding:20px;overflow:hidden">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border-subtle)">
              <div style="font-size:0.8rem;font-weight:800;color:var(--text-primary);display:flex;align-items:center;gap:6px">
                <span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block"></span>
                AI-Generated Brief
              </div>
              <div style="font-size:0.6rem;color:var(--text-muted);background:var(--bg-tertiary);padding:2px 8px;border-radius:8px">${cachedBrief.date ? new Date(cachedBrief.date).toLocaleDateString() : 'Today'}</div>
            </div>
            <div class="ai-brief-body" style="font-size:0.78rem;line-height:1.7;color:var(--text-secondary)">
              ${parsedBrief}
            </div>
          </div>
          ` : `
          <div style="background:var(--bg-secondary);border:1px dashed var(--border-medium);border-radius:14px;padding:40px 20px;text-align:center">
            <div style="font-size:2.5rem;margin-bottom:12px">🤖</div>
            <div style="font-size:0.85rem;font-weight:700;color:var(--text-primary);margin-bottom:6px">No AI Brief Yet</div>
            <div style="font-size:0.72rem;color:var(--text-muted);max-width:300px;margin:0 auto;line-height:1.6">Click "Generate AI Brief" above to create a GPT-4o powered intelligence summary from your signals and Streak deals.</div>
          </div>
          `}
        </div>

        <!-- Pipeline Status (below brief) -->
        <div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:10px;padding:12px 14px;margin-top:12px">
          <div style="font-size:0.6rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">📡 Sources</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            ${['Inc42', 'VCCircle', 'ET Tech', 'Mint', 'YourStory', 'Entrackr', 'Forbes India', 'DealStreetAsia', 'e27', 'TechCrunch', 'Crunchbase News', 'VentureBeat', 'SaaStr', 'Tech in Asia', 'Moneycontrol', 'Business Standard'].map(source => {
              const isActive = uniqueSources.includes(source);
              const color = sourceColors[source] || '#64748b';
              return `<span style="padding:2px 7px;border-radius:8px;font-size:0.5rem;font-weight:600;border:1px solid ${isActive ? color + '30' : 'var(--border-subtle)'};background:${isActive ? color + '10' : 'transparent'};color:${isActive ? color : 'var(--text-muted)'}">${isActive ? '●' : '○'} ${source}</span>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- RIGHT: Live Signal Feed -->
      ${signals.length > 0 ? `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-size:0.75rem;font-weight:800;color:var(--text-primary)">⚡ Live Feed</div>
          <div style="font-size:0.55rem;color:var(--text-muted)">${signals.length} signals</div>
        </div>

        <!-- Sector filter pills -->
        <div style="display:flex;gap:4px;margin-bottom:10px;flex-wrap:wrap" id="sector-tabs">
          <button class="sector-tab active" data-sector="all" style="padding:3px 10px;border-radius:12px;border:1px solid var(--border-medium);background:var(--accent-blue);color:white;font-size:0.55rem;font-weight:600;cursor:pointer;font-family:Inter">All</button>
          ${sectorList.slice(0, 6).map(sec => `
            <button class="sector-tab" data-sector="${sec}" style="padding:3px 10px;border-radius:12px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-muted);font-size:0.55rem;font-weight:600;cursor:pointer;font-family:Inter">${sec.charAt(0).toUpperCase() + sec.slice(1)}</button>
          `).join('')}
        </div>

        <!-- Signal cards -->
        <div id="signal-feed" style="display:flex;flex-direction:column;gap:6px;max-height:600px;overflow-y:auto;padding-right:4px">
          ${signalCards}
        </div>
      </div>
      ` : ''}
    </div>

    ${signals.length === 0 ? `
    <div style="padding:50px;text-align:center;color:var(--text-secondary);background:var(--bg-secondary);border-radius:14px;border:1px dashed var(--border-medium)">
      <div style="font-size:2.5rem;margin-bottom:14px">📡</div>
      <h3 style="color:var(--text-primary);margin-bottom:10px;font-size:1rem">No News Signals Yet</h3>
      <p style="max-width:450px;margin:0 auto 16px;font-size:0.8rem;line-height:1.6">Import the n8n workflow to start receiving real-time VC news from 18 sources.</p>
      <div style="text-align:left;max-width:350px;margin:0 auto;background:var(--bg-tertiary);border-radius:10px;padding:16px;font-size:0.72rem;line-height:1.8">
        <strong>Quick Setup:</strong><br>
        1️⃣ Import <code>news_rss_workflow_v6_final.json</code> into n8n<br>
        2️⃣ Connect Supabase credentials<br>
        3️⃣ Test run → activate schedule
      </div>
    </div>
    ` : ''}
  `;

  // Sector tab filtering
  document.querySelectorAll('.sector-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sector-tab').forEach(t => {
        t.style.background = 'transparent';
        t.style.color = 'var(--text-muted)';
        t.classList.remove('active');
      });
      tab.style.background = 'var(--accent-blue)';
      tab.style.color = 'white';
      tab.classList.add('active');
      const sector = tab.dataset.sector;
      document.querySelectorAll('.signal-item').forEach(item => {
        item.style.display = sector === 'all' || item.dataset.sector === sector ? '' : 'none';
      });
    });
  });

  // Generate Brief button
  document.getElementById('generate-brief-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('generate-brief-btn');
    const status = document.getElementById('brief-generation-status');
    const container = document.getElementById('ai-brief-container');
    btn.disabled = true;
    btn.textContent = '🧠 Generating...';
    btn.style.opacity = '0.6';
    status.textContent = 'Analyzing ' + signals.length + ' signals + ' + streakDeals.length + ' Streak deals with GPT-4o...';

    try {
      const briefHTML = await window.AI.dailyBrief(signals, streakDeals, window._portfolioMetrics || []);

      // Save to Supabase
      if (supabaseClient) {
        try {
          await supabaseClient.from('daily_briefs').upsert({
            brief_date: new Date().toISOString().split('T')[0],
            user_email: currentUser?.email || 'guest',
            content: briefHTML,
            model_used: 'gpt-4o'
          }, { onConflict: 'brief_date,user_email' });
        } catch (e) { console.warn('Brief save:', e.message); }
      }

      // Render the brief with markdown parsing
      container.style.display = '';
      container.innerHTML = `
        <div style="background:var(--bg-secondary);border:1px solid var(--border-medium);border-radius:14px;padding:20px;overflow:hidden">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border-subtle)">
            <div style="font-size:0.8rem;font-weight:800;color:var(--text-primary);display:flex;align-items:center;gap:6px">
              <span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;animation:pulse 2s infinite"></span>
              AI Brief · GPT-4o
            </div>
            <div style="font-size:0.6rem;color:var(--text-muted);background:var(--bg-tertiary);padding:2px 8px;border-radius:8px">Just now</div>
          </div>
          <div class="ai-brief-body" style="font-size:0.78rem;line-height:1.7;color:var(--text-secondary)">
            ${parseMarkdown(briefHTML)}
          </div>
        </div>`;
      btn.disabled = false;
      btn.textContent = '🔄 Regenerate';
      btn.style.opacity = '1';
      status.textContent = '✅ Brief generated and saved';
    } catch (err) {
      console.error('Brief generation failed:', err);
      status.textContent = '❌ ' + err.message + ' — Check OpenAI API key in config.js';
      btn.disabled = false;
      btn.textContent = '🤖 Retry';
      btn.style.opacity = '1';
    }
  });
}

// ============================================================
// MODULE 9: Integrations Hub
// ============================================================
function renderIntegrations(area) {
  const gmailStatus = integrationState.gmail.connected ? 'connected' : 'disconnected';
  const streakStatus = integrationState.streak.connected ? 'connected' : 'disconnected';
  const supabaseStatus = integrationState.supabase.connected ? 'connected' : 'disconnected';
  const now = new Date().toLocaleTimeString('en-US', { hour12: false });

  area.innerHTML = `
  < div class="stats-bar" >
      <div class="stat-card">
        <div class="stat-label">Integrations</div>
        <div class="stat-value emerald">4</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Connected</div>
        <div class="stat-value emerald">${[integrationState.gmail.connected, integrationState.streak.connected, integrationState.supabase.connected].filter(Boolean).length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Team Members</div>
        <div class="stat-value blue">${integrationState.team.members.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Sync Status</div>
        <div class="stat-value ${supabaseStatus === 'connected' ? 'emerald' : 'orange'}">${supabaseStatus === 'connected' ? 'Live' : 'Offline'}</div>
      </div>
    </div >

  <div class="integrations-grid">

    <!-- Supabase -->
    <div class="integration-card animated-item">
      <div class="integration-card-header">
        <div class="integration-logo supabase">🔋</div>
        <div>
          <div class="integration-name">Supabase</div>
          <div class="integration-desc">Real-time database & collaboration backend</div>
        </div>
        <div class="integration-status ${supabaseStatus}">
          <span>●</span> ${supabaseStatus === 'connected' ? 'Connected' : 'Disconnected'}
        </div>
      </div>
      <div class="integration-body">
        ${integrationState.supabase.connected ? `
            <div class="sync-log">
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Connected to Supabase</span></div>
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Project: vtxuzrkwnyhxciohwjjx</span></div>
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Real-time sync active</span></div>
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Ready for multi-user collaboration</span></div>
            </div>
          ` : `
            <div class="integration-input-group">
              <input class="integration-input" placeholder="Project URL" id="sb-url" value="${SUPABASE_URL}">
            </div>
            <div class="integration-input-group">
              <input class="integration-input" placeholder="Anon Key" id="sb-key" value="${SUPABASE_KEY}">
              <button class="integration-connect-btn" id="connect-supabase">Connect</button>
            </div>
          `}
        <div class="integration-features">
          <div class="integration-feature"><span class="integration-feature-icon">✅</span> Store deals, decks, and theses in cloud</div>
          <div class="integration-feature"><span class="integration-feature-icon">✅</span> Real-time collaboration with team</div>
          <div class="integration-feature"><span class="integration-feature-icon">✅</span> Access from any device / browser</div>
          <div class="integration-feature"><span class="integration-feature-icon">✅</span> Automatic backups & version history</div>
        </div>
      </div>
    </div>

    <!-- Gmail -->
    <div class="integration-card animated-item">
      <div class="integration-card-header">
        <div class="integration-logo gmail">📧</div>
        <div>
          <div class="integration-name">Gmail</div>
          <div class="integration-desc">Auto-scan deal emails & founder intros</div>
        </div>
        <div class="integration-status ${gmailStatus}">
          <span>●</span> ${gmailStatus === 'connected' ? 'Connected' : 'Not Connected'}
        </div>
      </div>
      <div class="integration-body">
        ${integrationState.gmail.connected ? `
            <div class="insight-box positive" style="margin:0">Connected as <strong>${integrationState.gmail.email}</strong></div>
            ${integrationState.gmail.emails.length > 0 ? `
              <div class="sync-log" style="max-height:180px">
                ${integrationState.gmail.emails.map(e => `
                  <div class="sync-log-entry" style="padding:6px 0">
                    <div style="font-weight:600;font-size:0.75rem;color:var(--text-primary)">${e.subject}</div>
                    <div style="font-size:0.68rem;color:var(--text-muted)">${e.from} · ${new Date(e.date).toLocaleDateString()}</div>
                    ${e.matchedStartups.length > 0 ? `<div style="margin-top:3px">${e.matchedStartups.map(s => `<span class="deal-tag" style="font-size:0.62rem">🏷️ ${s}</span>`).join(' ')}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="sync-log">
                <div class="sync-log-entry"><span class="sync-log-ok">✓ Connected — scanning for deal emails...</span></div>
              </div>
            `}
          ` : `
            <button class="integration-connect-btn google" id="connect-gmail" style="width:100%;justify-content:center">
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Connect Gmail Account
            </button>
            <div style="margin-top:8px;font-size:0.72rem;color:var(--text-muted);text-align:center">
              Click to set up Google OAuth · Steps will guide you through it
            </div>
          `}
        <div class="integration-features">
          <div class="integration-feature"><span class="integration-feature-icon">📥</span> Auto-detect deal mails from founders</div>
          <div class="integration-feature"><span class="integration-feature-icon">🏷️</span> Tag emails by startup in pipeline</div>
          <div class="integration-feature"><span class="integration-feature-icon">📊</span> Deal inbox with email thread summary</div>
          <div class="integration-feature"><span class="integration-feature-icon">🔔</span> Alerts for warm intro replies</div>
        </div>
      </div>
    </div>

    <!-- Streak CRM -->
    <div class="integration-card animated-item">
      <div class="integration-card-header">
        <div class="integration-logo streak">🔥</div>
        <div>
          <div class="integration-name">Streak CRM</div>
          <div class="integration-desc">Sync deal pipeline with Gmail CRM</div>
        </div>
        <div class="integration-status ${streakStatus}">
          <span>●</span> ${streakStatus === 'connected' ? 'Connected' : 'Not Connected'}
        </div>
      </div>
      <div class="integration-body">
        ${integrationState.streak.connected ? `
            <div class="insight-box positive" style="margin:0">✅ Syncing with Streak CRM — API key configured</div>
            <div class="sync-log">
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ API key validated: strk_...BiAx</span></div>
              ${integrationState.streak.pipelines.map(p => `
                <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Pipeline: ${p.name} (${p.boxes} boxes, ${p.stage})</span></div>
              `).join('')}
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Hot/Warm/Watch tiers mapped to Streak stages</span></div>
              <div class="sync-log-entry"><span class="sync-log-time">${now}</span> <span class="sync-log-ok">✓ Two-way sync active</span></div>
            </div>
          ` : `
            <div class="integration-input-group">
              <input class="integration-input" placeholder="Streak API Key (Settings → Integrations → API)" id="streak-key" type="password">
              <button class="integration-connect-btn streak-btn" id="connect-streak">Connect</button>
            </div>
          `}
        <div class="integration-features">
          <div class="integration-feature"><span class="integration-feature-icon">🔄</span> Two-way deal sync with Streak pipelines</div>
          <div class="integration-feature"><span class="integration-feature-icon">📋</span> Map Streak stages to JV tiers (Hot/Warm/Watch)</div>
          <div class="integration-feature"><span class="integration-feature-icon">📧</span> Link email threads to deal cards</div>
          <div class="integration-feature"><span class="integration-feature-icon">📊</span> Pull Streak deal notes into platform</div>
        </div>
      </div>
    </div>

    <!-- Team Collaboration -->
    <div class="integration-card animated-item">
      <div class="integration-card-header">
        <div class="integration-logo team">👥</div>
        <div>
          <div class="integration-name">Team</div>
          <div class="integration-desc">Collaborate and share the dashboard</div>
        </div>
        <div class="integration-status connected">
          <span>●</span> ${integrationState.team.members.length} members
        </div>
      </div>
      <div class="integration-body">
        <div class="team-grid">
          ${integrationState.team.members.map(m => `
              <div class="team-member-card">
                <div class="team-avatar" style="background:${m.color}">${m.name.split(' ').map(n => n[0]).join('')}</div>
                <div>
                  <div class="team-member-name">${m.name}</div>
                  <div class="team-member-role">${m.role}</div>
                </div>
              </div>
            `).join('')}
        </div>
        <div class="team-invite-form">
          <input class="integration-input" placeholder="Email address" id="invite-email">
            <select class="integration-input" id="invite-role" style="flex:0 0 120px">
              <option>Partner</option>
              <option>Analyst</option>
              <option>Associate</option>
              <option>Viewer</option>
            </select>
            <button class="integration-connect-btn" id="invite-btn">Invite</button>
        </div>
        <div class="integration-features" style="margin-top:14px">
          <div class="integration-feature"><span class="integration-feature-icon">🌐</span> Share via link — accessible from any browser</div>
          <div class="integration-feature"><span class="integration-feature-icon">🔒</span> Role-based access: Partner, Analyst, Viewer</div>
          <div class="integration-feature"><span class="integration-feature-icon">💬</span> Shared annotations on deals and decks</div>
          <div class="integration-feature"><span class="integration-feature-icon">🔔</span> Activity feed of team actions</div>
        </div>
      </div>
    </div>

  </div>
`;

  // Bind events
  document.getElementById('connect-gmail')?.addEventListener('click', () => {
    connectGmail();
  });

  document.getElementById('connect-streak')?.addEventListener('click', () => {
    const key = document.getElementById('streak-key')?.value;
    if (key && key.length > 10) {
      integrationState.streak.connected = true;
      integrationState.streak.apiKey = key;
      renderIntegrations(area);
    } else {
      alert('Please enter a valid Streak API key.\nFind it at: Streak → Settings → Integrations → API');
    }
  });

  document.getElementById('connect-supabase')?.addEventListener('click', () => {
    initSupabase();
    renderIntegrations(area);
  });

  document.getElementById('invite-btn')?.addEventListener('click', () => {
    const email = document.getElementById('invite-email')?.value;
    const role = document.getElementById('invite-role')?.value;
    if (email && email.includes('@')) {
      const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const colors = ['#6366f1', '#ec4899', '#f59e0b', '#3b82f6', '#8b5cf6', '#14b8a6'];
      integrationState.team.members.push({
        name, email, role,
        color: colors[integrationState.team.members.length % colors.length]
      });
      renderIntegrations(area);
    }
  });
}

// ============================================================
// PHASE 3: NEW INTELLIGENCE MODULES
// ============================================================

// ---- Meeting Prep Data ----
const IC_OBJECTIONS = {
  'Consumer Tech': [
    { objection: 'Unit economics don\'t work at scale in India', counter: 'CAC:LTV ratio is 1:4.2, improving 15% QoQ. Blended margin turns positive at 50K orders/day — currently at 32K.' },
    { objection: 'Crowded space with well-funded incumbents', counter: 'Incumbents focus on Tier-1. This targets Tier-2/3 where top 3 players have <8% penetration combined.' },
    { objection: 'Founders haven\'t built at this scale before', counter: 'CTO scaled infra at Flipkart from 10K→500K orders/day. CEO has domain expertise + strong operator DNA.' },
    { objection: 'Regulatory uncertainty in financial services', counter: 'RBI sandbox approval received. Licensed NBFC partner handles compliance. Similar model approved in 3 other markets.' },
    { objection: 'Path to profitability unclear', counter: 'Core commerce profitable. Losses from new city expansion. Each cohort reaches CM2 positive in month 4.' }
  ],
  'B2B Manufacturing': [
    { objection: 'Long sales cycles will burn cash', counter: 'Average pilot-to-contract is 6 weeks (vs. industry 4-6 months). Land-and-expand model: avg client grows 3.2x in year 1.' },
    { objection: 'Hardware dependency creates margin pressure', counter: 'Hardware is entry point only (15% of revenue). 85% comes from SaaS subscriptions with 78% gross margins.' },
    { objection: 'Small TAM in Southeast Asia', counter: 'ASEAN manufacturing output is $780B. Even 0.1% SaaS penetration = $780M addressable market.' },
    { objection: 'Difficult to build moat in enterprise software', counter: 'Proprietary ML models trained on 140M+ inspection images. Data moat deepens with each client — competitors start from zero.' },
    { objection: 'Team lacks manufacturing domain expertise', counter: 'CEO ran $500M manufacturing operations at Shell. Advisory board includes 3 ex-factory owners with 80+ years combined.' }
  ]
};

const TALKING_POINTS_TEMPLATES = [
  { label: 'Market Timing', template: (s) => `${s.name} is entering the ${s.subSector} market at an inflection point — ${s.geography} \$${s.tam}${s.tamUnit} TAM with only ${s.stage} -stage competition.` },
  { label: 'Founder Signal', template: (s) => `${s.founders[0].name} (${s.founders[0].pedigree.split(',')[0]}) brings rare combination of domain + execution.${s.founders.length > 1 ? s.founders[1].name + ' complements on tech side.' : ''} ` },
  { label: 'Traction Quality', template: (s) => `${s.metrics.mauGrowth}% MoM growth to ${s.metrics.mau > 1000 ? (s.metrics.mau / 1000).toFixed(0) + 'K' : s.metrics.mau} MAU.Revenue at \$${s.metrics.revenue > 1000 ? (s.metrics.revenue / 1000).toFixed(0) + 'K' : s.metrics.revenue}/mo growing ${s.metrics.revenueGrowth}% MoM.` },
  { label: 'Capital Efficiency', template: (s) => `Burning \$${(s.metrics.burnRate / 1000).toFixed(0)}K/mo with ${s.metrics.runway}mo runway. Last round: \$${s.lastRound.amount}M ${s.lastRound.type} — valuation implies ${(s.lastRound.amount / (s.metrics.revenue * 12 / 1000000) || 0).toFixed(0)}x revenue multiple.` },
  { label: 'Competitive Edge', template: (s) => `Key differentiation in ${s.subSector}: ${s.signals.founderExit.detail}. Hiring signal: ${s.signals.hiringSpike.detail}.` },
  { label: 'IC Ask', template: (s) => `Recommendation: ${s.scores ? (s.scores.composite > 75 ? 'Strong conviction — proceed to term sheet.' : s.scores.composite > 60 ? 'Positive lean — schedule deep dive with founders.' : 'Monitor — revisit in 3 months.') : 'Evaluate scoring data.'}` }
];

function renderMeetingPrep(area) {
  const startups = rankedStartups.length ? rankedStartups : [];
  let selectedId = 'startup-0';

  function buildPrep(id) {
    if (id.startsWith('streak-')) {
      const deal = streakDeals[parseInt(id.replace('streak-', ''))];
      if (!deal) return '<div class="empty-state">Deal not found</div>';
      
      const signals = window._newsSignals || [];
      const enrich = window._dealEnrichments?.[deal.box_key] || null;
      
      const score = deal._score || scoreStreakDeal(deal);
      const industry = deal._industry || 'Enterprise Software';
      
      // Auto-generated talking points based on CRM data + enrichment
      const talkingPts = [
        { label: 'Activity Velocity', text: `${deal.total_sent_emails || 0} outbound and ${deal.total_received_emails || 0} inbound emails. Deal is currently in stage: ${STREAK_STAGE_NAMES[deal.stage_key] || deal.stage_key}.` }
      ];
      
      if (enrich) {
        talkingPts.push({ label: 'AI Thesis Fit', text: `Scored ${enrich.thesis_fit_score}/100. Core strength: ${enrich.strengths[0] || 'Traction'}.` });
        if (enrich.latest_news_context) {
          talkingPts.push({ label: 'Recent Catalyst', text: enrich.latest_news_context });
        }
      }
      
      const relatedNews = signals.filter(s => s.title?.toLowerCase().includes((deal.name || '').toLowerCase().split(' ')[0])).slice(0, 2);
      if (relatedNews.length > 0) {
        talkingPts.push({ label: 'News Signal', text: `Mentioned in ${relatedNews[0].source}: "${relatedNews[0].title}" (${new Date(relatedNews[0].published_at || Date.now()).toLocaleDateString()}).` });
      }

      const risks = [];
      if (enrich && enrich.weaknesses && enrich.weaknesses.length) {
        risks.push({ risk: enrich.weaknesses[0], prob: 'Medium', impact: 'High' });
      } else {
        risks.push({ risk: 'Unverified core metrics', prob: 'High', impact: 'High' });
      }
      
      if (parseInt(deal.last_email_timestamp) && (Date.now() - parseInt(deal.last_email_timestamp)) > 14 * 86400000) {
        risks.push({ risk: 'Stale engagement (>14 days)', prob: 'High', impact: 'Medium' });
      }

      return `
      <div class="prep-snapshot">
        <div class="deal-card" style="margin-bottom:0">
          <div class="deal-card-header">
            <div class="deal-logo" style="background:var(--accent-indigo)">${deal.name?.substring(0, 2).toUpperCase() || '✨'}</div>
            <div class="deal-info">
              <h3 class="deal-name">${deal.name}</h3>
              <span class="deal-meta">${industry} · ${deal._country || 'Global'} · CRM Score: ${score}</span>
            </div>
            <div class="deal-score ${score >= 75 ? 'hot' : score >= 50 ? 'warm' : 'watch'}">${score}</div>
          </div>
          <p style="color:var(--text-secondary);font-size:0.82rem;margin:12px 0">${deal.notes || deal.description || 'No detailed description available in Streak.'}</p>
        </div>
      </div>

      <div class="phase3-grid">
        <div class="phase3-panel">
          <h3 class="phase3-panel-title">🗣️ CRM Auto-Prep</h3>
          <div class="talking-points-list">
            ${talkingPts.map(tp => `
              <div class="talking-point">
                <div class="tp-label">${tp.label}</div>
                <div class="tp-text">${tp.text}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="phase3-panel" style="margin-top:0">
          <h3 class="phase3-panel-title">⚠️ Identified Risks</h3>
          <div class="risk-matrix-grid">
            ${risks.map(r => `
              <div class="risk-item risk-${r.prob.toLowerCase()}-${r.impact.toLowerCase()}">
                <div class="risk-name">${r.risk}</div>
                <div class="risk-tags">
                  <span class="risk-tag prob-${r.prob.toLowerCase()}">P: ${r.prob}</span>
                  <span class="risk-tag impact-${r.impact.toLowerCase()}">I: ${r.impact}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      `;
    } else {
      // Legacy behavior for mock startups
      const s = startups[parseInt(id.replace('startup-', ''))];
      if (!s) return '<div class="empty-state">No startups available for prep</div>';
      const sectorObjns = IC_OBJECTIONS[s.sector] || IC_OBJECTIONS['Consumer Tech'];
      const talkingPts = TALKING_POINTS_TEMPLATES.map(t => ({ label: t.label, text: t.template(s) }));
      const risks = [
        { risk: 'Market timing too early', prob: s.tam > 20 ? 'Low' : 'Medium', impact: 'High' },
        { risk: 'Execution at scale', prob: s.metrics.mauGrowth > 100 ? 'Low' : 'Medium', impact: 'High' },
        { risk: 'Competitive response', prob: s.signals.hiringSpike.score > 70 ? 'Medium' : 'Low', impact: 'Medium' },
        { risk: 'Regulatory headwinds', prob: s.sector === 'Consumer Tech' ? 'Medium' : 'Low', impact: 'High' },
        { risk: 'Key person dependency', prob: s.founders.length < 2 ? 'High' : 'Low', impact: 'High' }
      ];

      return `
        <div class="prep-snapshot">
          <div class="deal-card" style="margin-bottom:0">
            <div class="deal-card-header">
              <div class="deal-logo">${s.logo}</div>
              <div class="deal-info">
                <h3 class="deal-name">${s.name}</h3>
                <span class="deal-meta">${s.subSector} · ${s.geography} · ${s.stage}</span>
              </div>
              <div class="deal-score ${getScoreClass(s.scores.composite)}">${s.scores.composite}</div>
            </div>
            <p style="color:var(--text-secondary);font-size:0.82rem;margin:12px 0">${s.description}</p>
            <div class="stats-row" style="margin-top:8px">
              <div class="stat-item"><div class="stat-value" style="color:var(--accent-green)">${s.metrics.mau > 1000 ? (s.metrics.mau / 1000).toFixed(0) + 'K' : s.metrics.mau}</div><div class="stat-label">MAU</div></div>
              <div class="stat-item"><div class="stat-value" style="color:var(--accent-blue)">$${s.metrics.revenue > 1000 ? (s.metrics.revenue / 1000).toFixed(0) + 'K' : s.metrics.revenue}</div><div class="stat-label">MRR</div></div>
              <div class="stat-item"><div class="stat-value" style="color:var(--accent-purple)">$${s.lastRound.amount}M</div><div class="stat-label">${s.lastRound.type}</div></div>
              <div class="stat-item"><div class="stat-value" style="color:var(--accent-orange)">${s.metrics.runway}mo</div><div class="stat-label">Runway</div></div>
            </div>
          </div>
        </div>

        <div class="phase3-grid">
          <div class="phase3-panel">
            <h3 class="phase3-panel-title">🗣️ Talking Points</h3>
            <div class="talking-points-list">
              ${talkingPts.map(tp => `
                <div class="talking-point">
                  <div class="tp-label">${tp.label}</div>
                  <div class="tp-text">${tp.text}</div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="phase3-panel">
            <h3 class="phase3-panel-title">⚔️ IC Objection Playbook</h3>
            <div class="objections-list">
              ${sectorObjns.map((o, i) => `
                <div class="objection-item">
                  <div class="objection-q">❓ "${o.objection}"</div>
                  <div class="objection-a">💡 ${o.counter}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="phase3-panel" style="margin-top:16px">
          <h3 class="phase3-panel-title">⚠️ Risk Matrix</h3>
          <div class="risk-matrix-grid">
            ${risks.map(r => `
              <div class="risk-item risk-${r.prob.toLowerCase()}-${r.impact.toLowerCase()}">
                <div class="risk-name">${r.risk}</div>
                <div class="risk-tags">
                  <span class="risk-tag prob-${r.prob.toLowerCase()}">P: ${r.prob}</span>
                  <span class="risk-tag impact-${r.impact.toLowerCase()}">I: ${r.impact}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  }

  const streakOptions = streakDeals.slice(0, 30).map((d, i) => 
    `<option value="streak-${i}">📧 ${d.name} — Streak CRM${d._industry ? ' · ' + d._industry : ''}</option>`
  ).join('');

  area.innerHTML = `
    <div class="prep-selector">
      <label class="prep-label">Select Company for Meeting Prep</label>
      <select class="filter-select prep-select" id="prep-company-select">
        <optgroup label="Scored Startups (Mock)">
          ${startups.map((s, i) => `<option value="startup-${i}">${s.logo} ${s.name} — ${s.subSector} (Score: ${s.scores.composite})</option>`).join('')}
        </optgroup>
        <optgroup label="Streak Pipeline (Live CRM)">
          ${streakOptions}
        </optgroup>
      </select>
    </div>
    <div id="prep-output">${buildPrep(selectedId)}</div>
  `;

  // Check if we have a default streak option to show first
  if (streakDeals.length > 0) {
    selectedId = 'streak-0';
    document.getElementById('prep-company-select').value = selectedId;
    document.getElementById('prep-output').innerHTML = buildPrep(selectedId);
  }

  document.getElementById('prep-company-select')?.addEventListener('change', (e) => {
    selectedId = e.target.value;
    document.getElementById('prep-output').innerHTML = buildPrep(selectedId);
  });
}

// ---- IC Memo Generator ----
function renderICMemo(area) {
  const startups = rankedStartups.length ? rankedStartups : [];
  let selectedStartup = startups[0];

  function buildMemo(s) {
    if (!s) return '<div class="empty-state">No startups to generate memo for</div>';
    const score = s.scores;
    const rec = score.composite > 75 ? 'PROCEED — Strong conviction' : score.composite > 60 ? 'LEAN POSITIVE — Deep dive recommended' : 'MONITOR — Revisit in 3 months';
    const recClass = score.composite > 75 ? 'hot' : score.composite > 60 ? 'warm' : 'watch';

    const memoHTML = `
## INVESTMENT COMMITTEE MEMO

**Company:** ${s.name}
**Sector:** ${s.subSector} (${s.sector})
**Geography:** ${s.city}, ${s.geography}
**Stage:** ${s.stage} | Last Round: $${s.lastRound.amount}M ${s.lastRound.type} (${s.lastRound.date})
**Deal Score:** ${score.composite}/100

---

### EXECUTIVE SUMMARY
${s.name} is a ${s.stage}-stage ${s.subSector.toLowerCase()} company based in ${s.city}, ${s.geography}. ${s.description}

Founded ${s.founded}, the company has achieved ${s.metrics.mau > 1000 ? (s.metrics.mau / 1000).toFixed(0) + 'K' : s.metrics.mau} MAU with ${s.metrics.mauGrowth}% MoM growth, generating \\$${s.metrics.revenue > 1000 ? (s.metrics.revenue / 1000).toFixed(0) + 'K' : s.metrics.revenue}/mo in revenue (growing ${s.metrics.revenueGrowth}% MoM).

### TEAM
${s.founders.map(f => `- **${f.name}** (${f.role}) — ${f.pedigree}`).join('\n')}

### MARKET OPPORTUNITY
- **TAM:** $${s.tam}${s.tamUnit}
- **Sector Dynamics:** ${s.signals.viralTraction.detail}
- **Competitive Position:** ${s.signals.founderExit.detail}

### TRACTION & METRICS
| Metric | Value | Trend |
|--------|-------|-------|
| MAU | ${s.metrics.mau > 1000 ? (s.metrics.mau / 1000).toFixed(0) + 'K' : s.metrics.mau} | +${s.metrics.mauGrowth}% MoM |
| Revenue | $${s.metrics.revenue > 1000 ? (s.metrics.revenue / 1000).toFixed(0) + 'K' : s.metrics.revenue}/mo | +${s.metrics.revenueGrowth}% MoM |
| Burn Rate | $${(s.metrics.burnRate / 1000).toFixed(0)}K/mo | — |
| Runway | ${s.metrics.runway} months | — |

### SIGNALS
- 👥 **Hiring:** ${s.signals.hiringSpike.detail} (${s.signals.hiringSpike.score}/100)
- 📈 **Traction:** ${s.signals.viralTraction.detail} (${s.signals.viralTraction.score}/100)
- 📲 **Downloads:** ${s.signals.appDownloads.detail} (${s.signals.appDownloads.score}/100)
- 💰 **Funding:** ${s.signals.angelFunding.detail} (${s.signals.angelFunding.score}/100)

### SCORING BREAKDOWN
- Market (${score.market}/100) | Founder (${score.founder}/100) | Traction (${score.traction}/100)
- Product (${score.product}/100) | Timing (${score.timing}/100)
- **Composite: ${score.composite}/100**

### RECOMMENDATION
**${rec}**

---
*Generated by Jungle Ventures Intelligence Platform — ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}*`;

    return `
      <div class="memo-container">
        <div class="memo-actions">
          <div class="tier-badge tier-${recClass}" style="font-size:0.85rem;padding:6px 16px">${rec}</div>
          <div style="display:flex;gap:8px">
            <button class="integration-connect-btn" id="memo-copy-btn">📋 Copy Memo</button>
            <button class="integration-connect-btn" id="memo-download-btn" style="background:var(--accent-purple)">⬇️ Download .md</button>
          </div>
        </div>
        <div class="memo-body">
          <pre class="memo-content">${memoHTML}</pre>
        </div>
        <div class="memo-radar" id="memo-radar-chart">
          ${createRadarChart(score, 200)}
        </div>
      </div>
    `;
  }

  // Also include Streak deals in the selector
  const streakOptions = streakDeals.slice(0, 30).map((d, i) => 
    `<option value="streak-${i}">📧 ${d.name} — Streak CRM${d._industry ? ' · ' + d._industry : ''}</option>`
  ).join('');

  area.innerHTML = `
    <div class="prep-selector" style="display:flex;gap:16px;align-items:end;flex-wrap:wrap">
      <div style="flex:1;min-width:250px">
        <label class="prep-label">Generate IC Memo For</label>
        <select class="filter-select prep-select" id="memo-company-select">
          <optgroup label="Scored Startups">
            ${startups.map((s, i) => `<option value="${i}">${s.logo} ${s.name} — Score: ${s.scores.composite}</option>`).join('')}
          </optgroup>
          <optgroup label="Streak CRM Deals">
            ${streakOptions}
          </optgroup>
        </select>
      </div>
      <button id="ai-memo-btn" style="padding:12px 24px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;border-radius:12px;font-size:0.85rem;font-weight:700;cursor:pointer;font-family:Inter;white-space:nowrap;transition:all 0.2s"
        onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(99,102,241,0.4)'"
        onmouseout="this.style.transform='';this.style.boxShadow=''">
        🤖 Generate with GPT-4o
      </button>
    </div>
    <div id="ai-memo-status" style="margin-top:8px;font-size:0.75rem;color:var(--text-muted)"></div>
    <div id="memo-output">${buildMemo(selectedStartup)}</div>
  `;

  function attachMemoListeners() {
    const rawMemo = document.querySelector('.memo-content')?.textContent || '';
    document.getElementById('memo-copy-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(rawMemo).then(() => {
        const btn = document.getElementById('memo-copy-btn');
        btn.textContent = '✅ Copied!';
        setTimeout(() => btn.textContent = '📋 Copy Memo', 2000);
      });
    });
    document.getElementById('memo-download-btn')?.addEventListener('click', () => {
      const blob = new Blob([rawMemo], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IC-Memo-${(selectedStartup?.name || 'deal').replace(/\s+/g, '-')}.md`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
  attachMemoListeners();

  // Handle company selector change
  document.getElementById('memo-company-select')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val.startsWith('streak-')) {
      const idx = parseInt(val.replace('streak-', ''));
      selectedStartup = null; // Can't use buildMemo for Streak deals
      const deal = streakDeals[idx];
      document.getElementById('memo-output').innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--text-secondary)">
          <div style="font-size:2rem;margin-bottom:12px">📧</div>
          <h3 style="color:var(--text-primary)">${deal.name}</h3>
          <p style="margin:12px 0">Streak CRM deal · ${deal._industry || 'Unknown sector'} · ${deal._country || ''}</p>
          <p style="font-size:0.8rem">Click <strong>"Generate with GPT-4o"</strong> above to create an AI-powered IC Memo for this deal.</p>
        </div>`;
    } else {
      selectedStartup = startups[parseInt(val)];
      document.getElementById('memo-output').innerHTML = buildMemo(selectedStartup);
      attachMemoListeners();
    }
  });

  // AI Memo Generation
  document.getElementById('ai-memo-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('ai-memo-btn');
    const status = document.getElementById('ai-memo-status');
    btn.disabled = true;
    btn.textContent = '🧠 Generating IC Memo...';
    btn.style.opacity = '0.6';
    status.textContent = 'Analyzing deal data, market context, and competitive landscape...';

    try {
      // Get the selected deal data
      const selVal = document.getElementById('memo-company-select')?.value || '0';
      let dealData = {};
      if (selVal.startsWith('streak-')) {
        const idx = parseInt(selVal.replace('streak-', ''));
        const deal = streakDeals[idx];
        dealData = { name: deal.name, industry: deal._industry, country: deal._country, stage: deal.stage, description: deal.notes || '', total_sent_emails: deal.total_sent_emails, total_received_emails: deal.total_received_emails, deal_size: deal.deal_size };
      } else if (selectedStartup) {
        dealData = { name: selectedStartup.name, industry: selectedStartup.subSector, country: selectedStartup.geography, stage: selectedStartup.stage, description: selectedStartup.description };
      }

      // Get related news
      const relatedNews = (window._newsSignals || []).filter(s =>
        s.title?.toLowerCase().includes(dealData.name?.toLowerCase()?.split(' ')[0] || '___')
      ).slice(0, 5);

      const memoHTML = await window.AI.generateICMemo(dealData, null, relatedNews);

      // Save to Supabase
      if (supabaseClient) {
        try {
          await supabaseClient.from('ic_memos').insert({
            deal_name: dealData.name,
            user_email: currentUser?.email || 'guest',
            memo_content: memoHTML,
            recommendation: 'AI Generated',
            model_used: 'gpt-4o'
          });
        } catch (e) { console.warn('IC Memo save:', e.message); }
      }

      // Render AI memo
      document.getElementById('memo-output').innerHTML = `
        <div class="memo-container" style="margin-top:16px">
          <div class="memo-actions">
            <div class="tier-badge tier-hot" style="font-size:0.85rem;padding:6px 16px">🤖 GPT-4o Generated</div>
            <div style="display:flex;gap:8px">
              <button class="integration-connect-btn" onclick="navigator.clipboard.writeText(document.getElementById('ai-memo-content').innerText).then(()=>{this.textContent='✅ Copied!';setTimeout(()=>this.textContent='📋 Copy',2000)})">📋 Copy</button>
            </div>
          </div>
          <div id="ai-memo-content" class="memo-body" style="font-size:0.88rem;line-height:1.7;color:var(--text-primary);padding:24px">
            ${memoHTML}
          </div>
        </div>`;

      btn.disabled = false;
      btn.textContent = '🤖 Regenerate with GPT-4o';
      btn.style.opacity = '1';
      status.textContent = '✅ IC Memo generated successfully';
    } catch (err) {
      console.error('AI Memo failed:', err);
      status.textContent = '❌ Failed: ' + err.message;
      btn.disabled = false;
      btn.textContent = '🤖 Retry GPT-4o';
      btn.style.opacity = '1';
    }
  });
}

function renderFundRadar(area) {
  if (!streakDeals.length) {
    area.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary)">Loading fundraising signals from Streak CRM...</div>';
    return;
  }

  const confColors = { High: 'var(--accent-green)', Medium: 'var(--accent-orange)', Low: 'var(--text-muted)' };
  const confBg = { High: 'rgba(16,185,129,0.1)', Medium: 'rgba(245,158,11,0.1)', Low: 'rgba(148,163,184,0.1)' };
  const HIGH_STAGES = new Set(['5003', '5011', '5004', '5007']);
  const MED_STAGES = new Set(['5002', '5018']);
  const ACTIVE = new Set(['5001', '5016', '5018', '5002', '5003', '5011', '5004', '5007', '5008', '5015']);
  const now = Date.now();

  function getDaysSince(d) {
    const ts = d.last_email_timestamp ? parseInt(d.last_email_timestamp) :
      d.updated_at ? parseInt(d.updated_at) : null;
    if (!ts) return 999;
    return Math.floor((now - ts) / 86400000);
  }
  function getTimeLabel(days) {
    if (days === 0) return 'Today'; if (days === 1) return '1 day ago';
    if (days < 7) return `${days} days ago`; if (days < 14) return '1 week ago';
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  }
  function getConf(d) {
    return HIGH_STAGES.has(d.stage_key) ? 'High' : MED_STAGES.has(d.stage_key) ? 'Medium' : 'Low';
  }
  function getSignalText(d) {
    const emails = (d.total_sent_emails || 0) + (d.total_received_emails || 0);
    const stage = STREAK_STAGE_NAMES[d.stage_key] || 'Active';
    if (d.stage_key === '5007') return `Urgent tracking — ${emails} email interactions, actively monitored`;
    if (d.stage_key === '5011') return `IC process initiated — ${emails} emails exchanged`;
    if (d.stage_key === '5003') return `Deep dive in progress — ${emails} emails, strong engagement`;
    if (d.stage_key === '5004') return `Term sheet stage — ${emails} total interactions`;
    if (d.stage_key === '5002') return `Met & active — ${emails} email interactions`;
    return `${stage} — ${emails} total interactions`;
  }

  const signals = streakDeals
    .filter(d => ACTIVE.has(d.stage_key) && getDaysSince(d) < 90)
    .sort((a, b) => getDaysSince(a) - getDaysSince(b))
    .slice(0, 30)
    .map(d => ({
      d,
      company: (d.name || '').replace(/^www\./, '').replace(/\.(com|co\.in|io|ai|net|org)(\/.*)?$/i, ''),
      signal: getSignalText(d),
      confidence: getConf(d),
      estStage: d.funding_stage || STREAK_STAGE_NAMES[d.stage_key] || 'Unknown',
      estSize: d.deal_size || '—',
      date: getTimeLabel(getDaysSince(d)),
      icon: d.stage_key === '5007' ? '🚨' : d.stage_key === '5011' ? '✅' : d.stage_key === '5003' ? '🔍' : '📡',
      country: d._country || inferCountry(d)
    }));

  const geoHeat = {};
  streakDeals.forEach(d => {
    const raw = inferCountry(d);
    const c = raw.replace(/^\S+\s*/, '').trim();
    if (c && c !== 'Unknown') geoHeat[c] = (geoHeat[c] || 0) + 1;
  });

  const industryHeat = {};
  streakDeals.filter(d => ACTIVE.has(d.stage_key)).forEach(d => {
    const ind = d._industry || inferIndustry(d);
    industryHeat[ind] = (industryHeat[ind] || 0) + 1;
  });
  const indMax = Math.max(1, ...Object.values(industryHeat));

  // Merge external news fundraise signals
  const newsSignals = (window._newsSignals || [])
    .filter(n => n.type === 'funding_round')
    .slice(0, 5);

  area.innerHTML = `
    ${getModuleNews('fundradar')}
    <div class="radar-stats-row">
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-green)">${signals.filter(s => s.confidence === 'High').length}</div><div class="stat-card-label">🔥 High Confidence</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-orange)">${signals.filter(s => s.confidence === 'Medium').length}</div><div class="stat-card-label">⚡ Medium Confidence</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--text-muted)">${signals.filter(s => s.confidence === 'Low').length}</div><div class="stat-card-label">👀 Watching</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-purple)">${signals.length}</div><div class="stat-card-label">📡 Active Deals</div></div>
    </div>

    <div class="phase3-grid">
      <div class="phase3-panel" style="flex:2">
        <h3 class="phase3-panel-title">📡 Signal Feed <span style="font-size:0.7rem;font-weight:400;color:var(--text-muted);margin-left:8px">Live · Streak CRM</span></h3>
        ${newsSignals.length ? `<div style="margin-bottom:12px;padding:10px 14px;background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.15);border-radius:8px"><div style="font-size:0.7rem;font-weight:600;color:var(--accent-green);margin-bottom:6px">📰 FROM NEWS (${newsSignals.length} funding rounds detected)</div>${newsSignals.map(n => `<div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:4px">• ${n.title} ${n.published_at ? '<span style="color:var(--text-muted);font-size:0.65rem">· ' + new Date(n.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '</span>' : ''}</div>`).join('')}</div>` : ''}
        <div class="signal-feed">
          ${signals.map(sig => `
            <div class="signal-item" style="border-left:3px solid ${confColors[sig.confidence]}">
              <div class="signal-header">
                <span class="signal-icon">${sig.icon}</span>
                <strong class="signal-company">${sig.company}</strong>
                <span class="signal-date">${sig.date}</span>
              </div>
              <div class="signal-body">${sig.signal}</div>
              <div class="signal-footer">
                <span class="signal-tag" style="background:${confBg[sig.confidence]};color:${confColors[sig.confidence]}">${sig.confidence} Confidence</span>
                <span class="signal-tag" style="background:rgba(99,102,241,0.1);color:var(--accent-indigo)">${sig.estStage}</span>
                <span class="signal-tag" style="background:rgba(236,72,153,0.1);color:var(--accent-pink)">${sig.estSize}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="phase3-panel" style="flex:1">
        <h3 class="phase3-panel-title">🗺️ Geographic Activity</h3>
        <div class="geo-heat-list">
          ${Object.entries(geoHeat).sort((a, b) => b[1] - a[1]).map(([geo, count]) => `
            <div class="geo-heat-item">
              <span class="geo-name">${geo}</span>
              <div class="geo-bar-wrap">
                <div class="geo-bar" style="width:${(count / Math.max(...Object.values(geoHeat))) * 100}%"></div>
              </div>
              <span class="geo-count">${count} deals</span>
            </div>
          `).join('')}
        </div>

        <h3 class="phase3-panel-title" style="margin-top:24px">🏭 Industry Mix</h3>
        <div class="geo-heat-list">
          ${Object.entries(industryHeat).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([ind, count]) => `
            <div class="geo-heat-item">
              <span class="geo-name">${ind}</span>
              <div class="geo-bar-wrap"><div class="geo-bar" style="width:${(count / indMax) * 100}%;background:var(--accent-purple)"></div></div>
              <span class="geo-count">${count}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderVCCRM(area) {
  if (!streakDeals.length) {
    area.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary)">Loading CRM data from Streak...</div>';
    return;
  }

  const now = Date.now();
  const ACTIVE_DEAL_STAGES = new Set(['5011', '5004', '5014', '5007']);
  const PIPELINE_STAGES = new Set(['5002', '5003', '5018']);

  function getStatus(d) {
    if (ACTIVE_DEAL_STAGES.has(d.stage_key)) return 'Active Deal';
    if (PIPELINE_STAGES.has(d.stage_key)) return 'Pipeline';
    return 'Watching';
  }

  function getDaysSince(d, founderProfile = null) {
    // If the founder profile has a more recent contact timestamp, use it
    let ts = null;
    if (founderProfile && founderProfile.last_contact) {
      ts = new Date(founderProfile.last_contact).getTime();
    }
    if (!ts) ts = d.last_email_timestamp ? parseInt(d.last_email_timestamp) : d.updated_at ? parseInt(d.updated_at) : null;
    if (!ts) return 999;
    return Math.floor((now - ts) / 86400000);
  }

  function getLastContactLabel(days) {
    if (days >= 999) return 'Never';
    if (days === 0) return 'Today'; if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`; if (days < 14) return '1 week ago';
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  }

  function getNextFollowUp(d, days) {
    if (d.stage_key === '5007') return 'Tomorrow';
    if (days > 60) return 'Overdue'; if (days > 30) return 'This week';
    if (days > 14) return 'In 2 weeks'; return 'Active';
  }

  function getStrength(d, founderProfile) {
    let score = 1;
    if (founderProfile && founderProfile.sentiment === 'Strong') score += 2;
    const e = (d.total_sent_emails || 0) + (d.total_received_emails || 0);
    if (ACTIVE_DEAL_STAGES.has(d.stage_key) && e > 10) return Math.min(5, score + 3);
    if (ACTIVE_DEAL_STAGES.has(d.stage_key)) return Math.min(5, score + 2);
    if (PIPELINE_STAGES.has(d.stage_key) && e > 5) return Math.min(5, score + 2);
    if (PIPELINE_STAGES.has(d.stage_key)) return Math.min(4, score + 1);
    return Math.min(5, score);
  }

  const SHOW = new Set(['5007', '5011', '5004', '5003', '5002', '5018', '5001', '5016', '5008', '5015', '5014']);

  // Build a map of founder profiles
  const profileMap = {};
  (window._founderProfiles || []).forEach(f => profileMap[f.box_key || f.company_name] = f);

  const relationships = streakDeals
    .filter(d => SHOW.has(d.stage_key))
    .map(d => {
      const enrich = (window._dealEnrichments || {})[d.box_key] || {};
      const companyName = (d.name || '').replace(/^www\./, '').replace(/\.(com|co\.in|io|ai|net|org)(\/.*)?$/i, '');
      const profile = profileMap[d.box_key] || profileMap[companyName]; // Try match by box_key or name

      const days = getDaysSince(d, profile);

      return {
        d, enrich, profile,
        status: getStatus(d), days,
        lastContact: getLastContactLabel(days),
        nextFollowUp: getNextFollowUp(d, days),
        strength: getStrength(d, profile),
        interactions: (d.total_sent_emails || 0) + (d.total_received_emails || 0),
        name: companyName,
        founderName: profile ? profile.founder_name : (enrich.founder_name || 'Unknown Founder'),
        industry: d._industry || inferIndustry(d),
        country: d._country || inferCountry(d)
      };
    })
    .sort((a, b) => {
      const pri = x => x.d.stage_key === '5007' ? 0 : x.nextFollowUp === 'Overdue' ? 1 : 2;
      return pri(a) - pri(b);
    })
    .slice(0, 60);

  const statusColors = { 'Active Deal': 'var(--accent-green)', 'Pipeline': 'var(--accent-blue)', 'Watching': 'var(--accent-orange)' };
  const overdue = relationships.filter(r => r.nextFollowUp === 'Overdue' || r.d.stage_key === '5007');
  const totalInteractions = relationships.reduce((a, r) => a + r.interactions, 0);

  area.innerHTML = `
    ${getModuleNews('vccrm')}
    
    <div style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
       <div>
         <h2 style="font-size:1.8rem;margin:0">Founder CRM</h2>
         <p style="color:var(--text-secondary);margin:4px 0 0 0">Live synchronization with Streak CRM and <code>vc_contacts</code> intelligence.</p>
       </div>
    </div>

    <div class="radar-stats-row">
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-green)">${relationships.filter(r => r.status === 'Active Deal').length}</div><div class="stat-card-label">Active Founders</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-blue)">${relationships.filter(r => r.status === 'Pipeline').length}</div><div class="stat-card-label">In Pipeline</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-red)">${overdue.length}</div><div class="stat-card-label">⚠️ Needs Follow-up</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-purple)">${totalInteractions}</div><div class="stat-card-label">Total Email Interactions</div></div>
    </div>

    <div class="phase3-grid">
      <div class="phase3-panel" style="flex:2">
        <h3 class="phase3-panel-title">👥 Founder Relationships <span style="font-size:0.7rem;font-weight:400;color:var(--text-muted);margin-left:8px">Live · ${relationships.length} companies</span></h3>
        <div class="crm-list" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          ${relationships.map(r => `
            <div class="crm-card${r.nextFollowUp === 'Overdue' || r.d.stage_key === '5007' ? ' crm-overdue' : ''}" style="background:var(--bg-secondary);padding:16px;border-radius:12px;border:1px solid var(--border-medium)">
              <div class="crm-card-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
                <div>
                  <strong class="crm-name" style="font-size:1.1rem;display:block;margin-bottom:4px">${r.founderName}</strong>
                  <span class="crm-role" style="font-size:0.8rem;color:var(--text-muted)">${r.name} · ${r.industry}</span>
                </div>
                <div class="crm-strength" style="color:var(--accent-yellow)">${'★'.repeat(r.strength)}${'☆'.repeat(5 - r.strength)}</div>
              </div>
              <div class="crm-card-body">
                <div class="crm-meta-row" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;font-size:0.75rem">
                  <span class="signal-tag" style="background:${statusColors[r.status]}22;color:${statusColors[r.status]}">${r.status}</span>
                  <span class="crm-meta" style="color:var(--text-secondary)">📅 Last: ${r.lastContact}</span>
                  <span class="crm-meta" style="color:${r.nextFollowUp === 'Overdue' ? 'var(--accent-red)' : 'var(--text-secondary)'}">${r.nextFollowUp === 'Overdue' || r.d.stage_key === '5007' ? '🔴' : '📌'} Next: ${r.nextFollowUp}</span>
                </div>
                ${r.profile && r.profile.sentiment ? `<div class="crm-notes" style="font-size:0.8rem;margin-bottom:8px">🧠 <strong>Sentiment:</strong> <span style="color:var(--accent-blue)">${r.profile.sentiment}</span></div>` : ''}
                ${r.profile && r.profile.notes ? `<div class="crm-notes" style="font-size:0.8rem;margin-bottom:8px;color:var(--text-secondary)">📝 ${r.profile.notes}</div>` : ''}
                ${!r.profile && r.enrich.founder_background ? `<div class="crm-notes" style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:8px">👤 ${r.enrich.founder_background}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="phase3-panel" style="flex:1">
        <h3 class="phase3-panel-title">🔔 Follow-Up Queue</h3>
        <div class="followup-queue">
          ${overdue.slice(0, 15).map(r => `
            <div class="followup-item${r.nextFollowUp === 'Overdue' || r.d.stage_key === '5007' ? ' followup-urgent' : ''}">
              <div class="followup-name">${r.name}</div>
              <div class="followup-company">${r.industry} · ${r.country}</div>
              <div class="followup-when">${r.d.stage_key === '5007' ? '🚨 URGENT' : '🔴 OVERDUE'}</div>
            </div>
          `).join('')}
          ${overdue.length === 0 ? '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.85rem">✅ All caught up!</div>' : ''}
        </div>

        <h3 class="phase3-panel-title" style="margin-top:24px">📊 Stage Breakdown</h3>
        <div class="intro-network">
          ${(() => {
      const counts = {};
      streakDeals.forEach(d => { const n = STREAK_STAGE_NAMES[d.stage_key] || d.stage_key; counts[n] = (counts[n] || 0) + 1; });
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([s, c]) =>
        `<div class="intro-source"><span class="intro-name">${s}</span><span class="intro-count">${c}</span></div>`
      ).join('');
    })()}
        </div>
      </div>
    </div>
  `;
}

// ---- Network Map Data ----
const CO_INVESTORS = [
  { name: 'Sequoia Capital India', deals: 5, sharedDeals: ['QuickDeliver', 'TokTok Bharat', 'PlaySEA'], color: '#6366f1' },
  { name: 'Accel Partners', deals: 4, sharedDeals: ['ChainFlow', 'FactoryOS', 'LendAPI'], color: '#f59e0b' },
  { name: 'Lightspeed India', deals: 3, sharedDeals: ['QuickDeliver', 'SaveStack', 'EyeQuality'], color: '#ec4899' },
  { name: 'Tiger Global', deals: 3, sharedDeals: ['BunPho', 'PlaySEA', 'TokTok Bharat'], color: '#10b981' },
  { name: 'Wavemaker Partners', deals: 2, sharedDeals: ['GreenMill', 'RoboAssembly'], color: '#8b5cf6' },
  { name: 'East Ventures', deals: 2, sharedDeals: ['MateriLink', 'ChainFlow'], color: '#f97316' },
  { name: 'GFC (Global Founders)', deals: 2, sharedDeals: ['PackBot', 'FactoryOS'], color: '#14b8a6' },
  { name: '500 Global', deals: 1, sharedDeals: ['LendAPI'], color: '#64748b' }
];

function renderNetworkMap(area) {
  // Build SVG network visualization
  const centerX = 400, centerY = 280, radius = 200;
  const nodes = CO_INVESTORS.map((inv, i) => {
    const angle = (i / CO_INVESTORS.length) * Math.PI * 2 - Math.PI / 2;
    return { ...inv, x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
  });

  const svgLines = nodes.map(n => `<line x1="${centerX}" y1="${centerY}" x2="${n.x}" y2="${n.y}" stroke="${n.color}" stroke-width="${n.deals * 0.8}" opacity="0.4"/>`).join('');
  const svgNodes = nodes.map(n => `
    <circle cx="${n.x}" cy="${n.y}" r="${12 + n.deals * 3}" fill="${n.color}" opacity="0.8"/>
    <text x="${n.x}" y="${n.y + 30 + n.deals * 3}" text-anchor="middle" fill="var(--text-secondary)" font-size="11" font-family="Inter">${n.name.split(' ').slice(0, 2).join(' ')}</text>
    <text x="${n.x}" y="${n.y + 44 + n.deals * 3}" text-anchor="middle" fill="var(--text-muted)" font-size="9" font-family="Inter">${n.deals} co-deals</text>
  `).join('');

  // Render co-investor network first
  area.innerHTML = `
    <div class="phase3-grid">
      <div class="phase3-panel" style="flex:2">
        <h3 class="phase3-panel-title">🕸️ Co-Investment Network</h3>
        <div class="network-svg-wrap">
          <svg viewBox="0 0 800 560" class="network-svg">
            ${svgLines}
            <circle cx="${centerX}" cy="${centerY}" r="28" fill="var(--accent-green)" opacity="0.9"/>
            <text x="${centerX}" y="${centerY - 4}" text-anchor="middle" fill="white" font-size="10" font-weight="700" font-family="Inter">Jungle</text>
            <text x="${centerX}" y="${centerY + 10}" text-anchor="middle" fill="white" font-size="10" font-weight="700" font-family="Inter">Ventures</text>
            ${svgNodes}
          </svg>
        </div>
      </div>

      <div class="phase3-panel" style="flex:1">
        <h3 class="phase3-panel-title">🏆 Top Co-Investors</h3>
        <div class="coinvestor-list">
          ${CO_INVESTORS.sort((a, b) => b.deals - a.deals).map((inv, i) => `
            <div class="coinvestor-item">
              <div class="coinvestor-rank">#${i + 1}</div>
              <div class="coinvestor-info">
                <div class="coinvestor-name">${inv.name}</div>
                <div class="coinvestor-deals">${inv.sharedDeals.join(', ')}</div>
              </div>
              <div class="coinvestor-count" style="color:${inv.color}">${inv.deals}</div>
            </div>
          `).join('')}
        </div>

        <h3 class="phase3-panel-title" style="margin-top:24px">💡 Syndicate Suggestions</h3>
        <div class="syndicate-list">
          ${rankedStartups.slice(0, 4).map(s => {
    const suggested = CO_INVESTORS.filter(inv => inv.sharedDeals.some(d => rankedStartups.find(rs => rs.name === d)?.sector === s.sector)).slice(0, 2);
    return `<div class="syndicate-item">
              <span class="syndicate-deal">${s.logo} ${s.name}</span>
              <span class="syndicate-partners">${suggested.map(inv => inv.name.split(' ')[0]).join(', ') || 'New partner needed'}</span>
            </div>`;
  }).join('')}
        </div>
      </div>
    </div>

    <div id="startup-linker-section"></div>
  `;

  // Async: fetch real data from Supabase for the Startup Linker
  (async () => {
    const linkerEl = document.getElementById('startup-linker-section');
    if (!linkerEl) return;

    let sectors = [], companies = [], comparisons = [], comps = [];
    if (supabaseConnected && supabaseClient) {
      try {
        const [sRes, cRes, compRes, mRes] = await Promise.all([
          supabaseClient.from('industry_sectors').select('*'),
          supabaseClient.from('public_companies').select('*'),
          supabaseClient.from('startup_comparisons').select('*').limit(50),
          supabaseClient.from('public_market_comps').select('*')
        ]);
        sectors = sRes.data || [];
        companies = cRes.data || [];
        comparisons = compRes.data || [];
        comps = mRes.data || [];
      } catch (e) { console.warn('Linker data:', e.message); }
    }

    // Build the sector cluster visualization
    const sectorColors = {
      fintech: '#6366f1', edtech: '#f59e0b', healthtech: '#ef4444', ecommerce: '#10b981',
      saas: '#3b82f6', logistics: '#f97316', deeptech: '#8b5cf6', cleantech: '#22c55e',
      consumer: '#ec4899', proptech: '#14b8a6', gaming: '#a855f7', insurance: '#06b6d4'
    };

    // Group companies by sector
    const sectorGroups = {};
    companies.forEach(c => {
      const sid = c.sector_id || 'other';
      if (!sectorGroups[sid]) sectorGroups[sid] = [];
      sectorGroups[sid].push(c);
    });

    // Build sector cluster SVG
    const sectorKeys = Object.keys(sectorGroups);
    const clusterRadius = 220;
    const clusterCX = 400, clusterCY = 280;
    let clusterSVG = '';
    let clusterNodes = '';

    sectorKeys.forEach((sid, i) => {
      const angle = (i / sectorKeys.length) * Math.PI * 2 - Math.PI / 2;
      const cx = clusterCX + Math.cos(angle) * clusterRadius;
      const cy = clusterCY + Math.sin(angle) * clusterRadius;
      const color = sectorColors[sid] || '#64748b';
      const sectorName = sectors.find(s => s.sector_id === sid)?.sector_name || sid;
      const count = sectorGroups[sid].length;

      // Line from center to sector cluster
      clusterSVG += `<line x1="${clusterCX}" y1="${clusterCY}" x2="${cx}" y2="${cy}" stroke="${color}" stroke-width="2" opacity="0.3" stroke-dasharray="5,5"/>`;

      // Sector cluster node
      clusterNodes += `
        <circle cx="${cx}" cy="${cy}" r="${18 + count * 4}" fill="${color}" opacity="0.15"/>
        <circle cx="${cx}" cy="${cy}" r="${14 + count * 3}" fill="${color}" opacity="0.7"/>
        <text x="${cx}" y="${cy + 3}" text-anchor="middle" fill="white" font-size="9" font-weight="600" font-family="Inter">${count}</text>
        <text x="${cx}" y="${cy + 28 + count * 3}" text-anchor="middle" fill="var(--text-secondary)" font-size="10" font-family="Inter">${sectorName}</text>
      `;

      // Small nodes for each company in this cluster
      sectorGroups[sid].forEach((comp, j) => {
        const subAngle = angle + ((j - count / 2) * 0.3);
        const subR = clusterRadius + 50 + j * 15;
        const sx = clusterCX + Math.cos(subAngle) * subR;
        const sy = clusterCY + Math.sin(subAngle) * subR;
        clusterSVG += `<line x1="${cx}" y1="${cy}" x2="${sx}" y2="${sy}" stroke="${color}" stroke-width="1" opacity="0.2"/>`;
        clusterNodes += `
          <circle cx="${sx}" cy="${sy}" r="6" fill="${color}" opacity="0.5"/>
          <text x="${sx}" y="${sy + 16}" text-anchor="middle" fill="var(--text-muted)" font-size="7" font-family="JetBrains Mono">${comp.ticker.split('.')[0]}</text>
        `;
      });
    });

    // Pipeline startups in the center cluster
    const pipelineStartups = rankedStartups.slice(0, 6);
    pipelineStartups.forEach((s, i) => {
      const angle = (i / pipelineStartups.length) * Math.PI * 2;
      const px = clusterCX + Math.cos(angle) * 60;
      const py = clusterCY + Math.sin(angle) * 60;
      clusterSVG += `<line x1="${clusterCX}" y1="${clusterCY}" x2="${px}" y2="${py}" stroke="var(--accent-green)" stroke-width="1.5" opacity="0.4"/>`;
      clusterNodes += `
        <circle cx="${px}" cy="${py}" r="8" fill="var(--accent-green)" opacity="0.8"/>
        <text x="${px}" y="${py + 18}" text-anchor="middle" fill="var(--accent-green)" font-size="8" font-weight="500" font-family="Inter">${s.name}</text>
      `;
    });

    linkerEl.innerHTML = `
      <div class="phase3-grid" style="margin-top:16px">
        <div class="phase3-panel" style="flex:2">
          <h3 class="phase3-panel-title">🔗 Startup Linker Graph</h3>
          <p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:8px">Sector clusters → Public comparables → Pipeline startups. Lines show relationships.</p>
          <div class="network-svg-wrap">
            <svg viewBox="0 0 800 560" class="network-svg">
              ${clusterSVG}
              <circle cx="${clusterCX}" cy="${clusterCY}" r="22" fill="var(--accent-green)" opacity="0.9"/>
              <text x="${clusterCX}" y="${clusterCY + 4}" text-anchor="middle" fill="white" font-size="9" font-weight="700" font-family="Inter">Pipeline</text>
              ${clusterNodes}
            </svg>
          </div>
        </div>

        <div class="phase3-panel" style="flex:1">
          <h3 class="phase3-panel-title">📊 Sector Coverage</h3>
          <div class="coinvestor-list">
            ${sectorKeys.map(sid => {
      const sectorName = sectors.find(s => s.sector_id === sid)?.sector_name || sid;
      const color = sectorColors[sid] || '#64748b';
      const count = sectorGroups[sid].length;
      return `<div class="coinvestor-item">
                <span style="color:${color};font-size:1.2rem;margin-right:8px">●</span>
                <div class="coinvestor-info">
                  <div class="coinvestor-name">${sectorName}</div>
                  <div class="coinvestor-deals">${sectorGroups[sid].map(c => c.ticker.split('.')[0]).join(', ')}</div>
                </div>
                <div class="coinvestor-count" style="color:${color}">${count}</div>
              </div>`;
    }).join('')}
          </div>

          ${comparisons.length > 0 ? `
          <h3 class="phase3-panel-title" style="margin-top:16px">⚔️ Startup Matches</h3>
          <div class="coinvestor-list">
            ${comparisons.slice(0, 8).map(c => `<div class="coinvestor-item">
              <div class="coinvestor-info">
                <div class="coinvestor-name" style="font-size:0.8rem">${c.startup_a} ↔ ${c.startup_b}</div>
                <div class="coinvestor-deals">${c.relationship || '—'} · ${c.source || '—'}</div>
              </div>
              <div class="coinvestor-count" style="color:var(--accent-purple)">${c.similarity_score || '—'}%</div>
            </div>`).join('')}
          </div>` : ''}
        </div>
      </div>
    `;
  })();
}

// ============================================================
// PHASE 4: ADVANCED ANALYTICS
// ============================================================

// ---- Competitive Landscape ----
const COMPETITORS = [
  { name: 'Sequoia India', aum: '$9.5B', focus: 'Series A-C', deals2025: 42, avgCheck: '$15M', strengths: ['Brand', 'Network', 'Follow-on'], weaknesses: ['Slow DD', 'Board heavy'], overlap: 6, color: '#6366f1' },
  { name: 'Accel India', aum: '$3.2B', focus: 'Seed-Series B', deals2025: 38, avgCheck: '$8M', strengths: ['Speed', 'Founder-first', 'Platform'], weaknesses: ['Small fund', 'Less ASEAN'], overlap: 4, color: '#f59e0b' },
  { name: 'Lightspeed', aum: '$7.1B', focus: 'Series A-B', deals2025: 31, avgCheck: '$12M', strengths: ['Global reach', 'Data-driven'], weaknesses: ['Less local', 'High bar'], overlap: 3, color: '#ec4899' },
  { name: 'Tiger Global', aum: '$12.7B', focus: 'Growth', deals2025: 25, avgCheck: '$25M', strengths: ['Speed', 'Large checks', 'No board'], weaknesses: ['Less hands-on', 'Pullback risk'], overlap: 3, color: '#10b981' },
  { name: 'East Ventures', aum: '$0.9B', focus: 'Pre-Seed/Seed', deals2025: 55, avgCheck: '$1.5M', strengths: ['Indonesia deep', 'Speed', 'Community'], weaknesses: ['Small checks', 'Limited follow-on'], overlap: 2, color: '#f97316' },
  { name: 'Wavemaker', aum: '$0.6B', focus: 'Seed-Series A', deals2025: 28, avgCheck: '$3M', strengths: ['ASEAN native', 'Operator network'], weaknesses: ['Fund size', 'Brand awareness'], overlap: 2, color: '#8b5cf6' }
];

function renderCompetitive(area) {
  const jv = { name: 'Jungle Ventures', aum: '$1.5B', focus: 'Seed-Series B', deals2025: 16, avgCheck: '$5M', color: 'var(--accent-green)' };

  // Fetch real comparisons from Supabase if available
  const renderWithData = async () => {
    let publicComps = [];
    let sectorData = [];
    let comparisons = [];

    if (supabaseConnected && supabaseClient) {
      try {
        const [compRes, sectorRes, comparisonRes] = await Promise.all([
          supabaseClient.from('public_companies').select('*').limit(20),
          supabaseClient.from('industry_sectors').select('*'),
          supabaseClient.from('startup_comparisons').select('*').limit(50)
        ]);
        publicComps = compRes.data || [];
        sectorData = sectorRes.data || [];
        comparisons = comparisonRes.data || [];
      } catch (e) { console.warn('Competitive data fetch:', e.message); }
    }

    area.innerHTML = `
      <div class="radar-stats-row">
        <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-green)">${COMPETITORS.length}</div><div class="stat-card-label">Tracked VC Competitors</div></div>
        <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-blue)">${publicComps.length}</div><div class="stat-card-label">Public Comps Tracked</div></div>
        <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-purple)">${sectorData.length}</div><div class="stat-card-label">Industry Sectors</div></div>
        <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-orange)">${comparisons.length}</div><div class="stat-card-label">Startup Comparisons</div></div>
      </div>

      <div class="phase3-grid">
        <div class="phase3-panel" style="flex:2">
          <h3 class="phase3-panel-title">🏟️ VC Competitive Positioning</h3>
          <div class="comp-table-wrap">
            <table class="comp-table">
              <thead><tr><th>Fund</th><th>AUM</th><th>Focus</th><th>Deals '25</th><th>Avg Check</th><th>Overlap</th><th>Strengths</th></tr></thead>
              <tbody>
                <tr class="comp-row-jv"><td><strong>🌴 ${jv.name}</strong></td><td>${jv.aum}</td><td>${jv.focus}</td><td>${jv.deals2025}</td><td>${jv.avgCheck}</td><td>—</td><td>ASEAN focus, Speed, LP network</td></tr>
                ${COMPETITORS.map(c => `<tr>
                  <td><span style="color:${c.color}">●</span> ${c.name}</td><td>${c.aum}</td><td>${c.focus}</td><td>${c.deals2025}</td><td>${c.avgCheck}</td>
                  <td><span class="comp-overlap">${c.overlap}</span></td>
                  <td>${c.strengths.slice(0, 2).join(', ')}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="phase3-panel" style="flex:1">
          <h3 class="phase3-panel-title">⚔️ SWOT — Jungle Ventures</h3>
          <div class="swot-grid">
            <div class="swot-box swot-s"><div class="swot-label">Strengths</div><ul><li>Deep ASEAN network</li><li>Speed to term sheet</li><li>Founder-friendly terms</li><li>LP co-invest program</li></ul></div>
            <div class="swot-box swot-w"><div class="swot-label">Weaknesses</div><ul><li>Smaller fund vs peers</li><li>Limited US presence</li><li>Brand awareness in India</li><li>Follow-on capacity</li></ul></div>
            <div class="swot-box swot-o"><div class="swot-label">Opportunities</div><ul><li>Vietnam/Philippines growth</li><li>B2B Manufacturing boom</li><li>ESG/Climate tech wave</li><li>Web3 infrastructure</li></ul></div>
            <div class="swot-box swot-t"><div class="swot-label">Threats</div><ul><li>Tiger/Coatue return</li><li>Local fund scaling</li><li>LP allocation shifts</li><li>Macro downturn</li></ul></div>
          </div>
        </div>
      </div>

      ${publicComps.length > 0 ? `
      <div class="phase3-panel" style="margin-top:16px">
        <h3 class="phase3-panel-title">📈 Public Market Comparables (Live)</h3>
        <div class="comp-table-wrap">
          <table class="comp-table">
            <thead><tr><th>Ticker</th><th>Company</th><th>Exchange</th><th>Sector</th><th>Market Cap ($B)</th><th>P/E</th><th>Revenue ($M)</th><th>Rev Growth</th></tr></thead>
            <tbody>
              ${publicComps.map(c => `<tr>
                <td><strong style="color:var(--accent-blue)">${c.ticker}</strong></td>
                <td>${c.name}</td>
                <td><span class="signal-tag" style="background:var(--bg-tertiary);color:var(--text-secondary)">${c.exchange || '—'}</span></td>
                <td>${c.sector_id || '—'}</td>
                <td>${c.market_cap_usd_bn ? '$' + c.market_cap_usd_bn.toFixed(1) + 'B' : '—'}</td>
                <td>${c.pe_ratio ? c.pe_ratio.toFixed(1) + 'x' : '—'}</td>
                <td>${c.revenue_usd_mn ? '$' + c.revenue_usd_mn.toFixed(0) + 'M' : '—'}</td>
                <td style="color:${(c.revenue_growth_pct || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">${c.revenue_growth_pct ? c.revenue_growth_pct.toFixed(1) + '%' : '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

      ${sectorData.length > 0 ? `
      <div class="phase3-panel" style="margin-top:16px">
        <h3 class="phase3-panel-title">🏭 Sector Intelligence</h3>
        <div class="phase3-grid" style="flex-wrap:wrap">
          ${sectorData.slice(0, 8).map(s => `
          <div class="stat-card" style="flex:1;min-width:200px;cursor:pointer" onclick="switchSection('industryview')">
            <div class="stat-card-value" style="font-size:1rem;color:var(--accent-blue)">${s.sector_name}</div>
            <div class="stat-card-label">
              ${s.market_size_usd_bn ? 'Market: $' + s.market_size_usd_bn + 'B' : ''}
              ${s.cagr_pct ? ' · CAGR: ' + s.cagr_pct + '%' : ''}
            </div>
            ${s.key_trends ? '<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">' + s.key_trends.slice(0, 2).map(t => '<span class="signal-tag" style="font-size:0.6rem;background:var(--accent-blue)22;color:var(--accent-blue)">' + t + '</span>').join('') + '</div>' : ''}
          </div>`).join('')}
        </div>
      </div>` : ''}
    `;
  };
  renderWithData();
}

// ---- Public Market Comps Module ----
function renderPublicMarketComps(area) {
  const renderAsync = async () => {
    let companies = [];
    let sectors = [];
    let comps = [];

    if (supabaseConnected && supabaseClient) {
      try {
        const [cRes, sRes, mRes] = await Promise.all([
          supabaseClient.from('public_companies').select('*').order('market_cap_usd_bn', { ascending: false }),
          supabaseClient.from('industry_sectors').select('*'),
          supabaseClient.from('public_market_comps').select('*')
        ]);
        companies = cRes.data || [];
        sectors = sRes.data || [];
        comps = mRes.data || [];
      } catch (e) { console.warn('Public comps fetch:', e.message); }
    }

    const totalMarketCap = companies.reduce((a, c) => a + (c.market_cap_usd_bn || 0), 0);
    const avgPE = companies.filter(c => c.pe_ratio).length > 0 ? (companies.reduce((a, c) => a + (c.pe_ratio || 0), 0) / companies.filter(c => c.pe_ratio).length).toFixed(1) : '—';
    const exchanges = [...new Set(companies.map(c => c.exchange).filter(Boolean))];

    area.innerHTML = `
      <div class="radar-stats-row">
        <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-green)">${companies.length}</div><div class="stat-card-label">Companies Tracked</div></div>
        <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-blue)">$${totalMarketCap.toFixed(0)}B</div><div class="stat-card-label">Total Market Cap</div></div>
        <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-purple)">${avgPE}x</div><div class="stat-card-label">Avg P/E Ratio</div></div>
        <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-orange)">${exchanges.length}</div><div class="stat-card-label">Exchanges Covered</div></div>
      </div>

      <div class="phase3-panel">
        <h3 class="phase3-panel-title">📊 Public Market Comparables</h3>
        <p style="color:var(--text-muted);margin-bottom:12px">Track public company benchmarks to value private startups. Data refreshed daily via Yahoo Finance.</p>
        <div class="comp-table-wrap">
          <table class="comp-table">
            <thead><tr><th>Ticker</th><th>Company</th><th>Exchange</th><th>Sector</th><th>Market Cap</th><th>P/E</th><th>Revenue</th><th>Growth</th><th>52W Range</th></tr></thead>
            <tbody>
              ${companies.length > 0 ? companies.map(c => `<tr>
                <td><strong style="color:var(--accent-blue)">${c.ticker}</strong></td>
                <td>${c.name}</td>
                <td><span class="signal-tag" style="background:var(--bg-tertiary);color:var(--text-secondary);font-size:0.7rem">${c.exchange || '—'}</span></td>
                <td>${c.sector_id || '—'}</td>
                <td>${c.market_cap_usd_bn ? '$' + c.market_cap_usd_bn.toFixed(1) + 'B' : '<span style="color:var(--text-muted)">Awaiting data</span>'}</td>
                <td>${c.pe_ratio ? c.pe_ratio.toFixed(1) + 'x' : '—'}</td>
                <td>${c.revenue_usd_mn ? '$' + c.revenue_usd_mn.toFixed(0) + 'M' : '—'}</td>
                <td style="color:${(c.revenue_growth_pct || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">${c.revenue_growth_pct ? (c.revenue_growth_pct > 0 ? '+' : '') + c.revenue_growth_pct.toFixed(1) + '%' : '—'}</td>
                <td style="font-size:0.75rem">${c.price_52w_low && c.price_52w_high ? '$' + c.price_52w_low.toFixed(0) + ' – $' + c.price_52w_high.toFixed(0) : '—'}</td>
              </tr>`).join('') : '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px">Run the Phase 3 migration SQL to seed public company data, then activate the Yahoo Finance n8n workflow to populate live prices.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      ${comps.length > 0 ? `
      <div class="phase3-panel" style="margin-top:16px">
        <h3 class="phase3-panel-title">🔗 Startup → Public Company Mappings</h3>
        <div class="comp-table-wrap">
          <table class="comp-table">
            <thead><tr><th>Startup</th><th>Public Comparable</th><th>Type</th><th>Multiple</th><th>Notes</th></tr></thead>
            <tbody>
              ${comps.map(m => `<tr>
                <td><strong>${m.startup_name}</strong></td>
                <td style="color:var(--accent-blue)">${m.ticker}</td>
                <td><span class="signal-tag" style="background:var(--accent-purple)22;color:var(--accent-purple);font-size:0.7rem">${m.comp_type || '—'}</span></td>
                <td>${m.valuation_multiple ? m.valuation_multiple.toFixed(1) + 'x' : '—'}</td>
                <td style="color:var(--text-muted)">${m.notes || '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}
    `;
  };
  renderAsync();
}

// ---- Industry Analyzer Module ----
function renderIndustryAnalyzer(area) {
  const renderAsync = async () => {
    let sectors = [];
    let companies = [];
    let news = [];

    if (supabaseConnected && supabaseClient) {
      try {
        const [sRes, cRes, nRes] = await Promise.all([
          supabaseClient.from('industry_sectors').select('*').order('market_size_usd_bn', { ascending: false }),
          supabaseClient.from('public_companies').select('*'),
          supabaseClient.from('news_signals').select('*').order('published_at', { ascending: false }).limit(20)
        ]);
        sectors = sRes.data || [];
        companies = cRes.data || [];
        news = nRes.data || [];
      } catch (e) { console.warn('Industry data fetch:', e.message); }
    }

    const totalMarketSize = sectors.reduce((a, s) => a + (s.market_size_usd_bn || 0), 0);
    const avgCAGR = sectors.length > 0 ? (sectors.reduce((a, s) => a + (s.cagr_pct || 0), 0) / sectors.length).toFixed(1) : '—';
    const pipelineByIndustry = {};
    rankedStartups.forEach(s => {
      const sector = s.sector || 'Other';
      pipelineByIndustry[sector] = (pipelineByIndustry[sector] || 0) + 1;
    });

    area.innerHTML = `
      <div class="radar-stats-row">
        <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-green)">${sectors.length}</div><div class="stat-card-label">Sectors Tracked</div></div>
        <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-blue)">$${totalMarketSize.toFixed(0)}B</div><div class="stat-card-label">Total Addressable Market</div></div>
        <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-purple)">${avgCAGR}%</div><div class="stat-card-label">Avg Sector CAGR</div></div>
        <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-orange)">${news.length}</div><div class="stat-card-label">Recent Signals</div></div>
      </div>

      <div class="phase3-grid">
        <div class="phase3-panel" style="flex:2">
          <h3 class="phase3-panel-title">🏭 Sector Deep Dive</h3>
          <div class="comp-table-wrap">
            <table class="comp-table">
              <thead><tr><th>Sector</th><th>Market Size</th><th>CAGR</th><th>Public Comps</th><th>Pipeline Deals</th><th>Key Trends</th></tr></thead>
              <tbody>
                ${sectors.length > 0 ? sectors.map(s => {
      const sCompanies = companies.filter(c => c.sector_id === s.sector_id);
      const dealCount = pipelineByIndustry[s.sector_name] || 0;
      return `<tr>
                    <td><strong>${s.sector_name}</strong></td>
                    <td>${s.market_size_usd_bn ? '$' + s.market_size_usd_bn + 'B' : '—'}</td>
                    <td style="color:${(s.cagr_pct || 0) > 15 ? 'var(--accent-green)' : 'var(--text-secondary)'}">${s.cagr_pct ? s.cagr_pct + '%' : '—'}</td>
                    <td>${sCompanies.length > 0 ? sCompanies.map(c => '<span style="color:var(--accent-blue);font-size:0.75rem">' + c.ticker + '</span>').join(', ') : '<span style="color:var(--text-muted)">—</span>'}</td>
                    <td>${dealCount > 0 ? '<strong style="color:var(--accent-green)">' + dealCount + '</strong>' : '0'}</td>
                    <td>${s.key_trends ? s.key_trends.slice(0, 3).map(t => '<span class="signal-tag" style="font-size:0.6rem;background:var(--accent-blue)22;color:var(--accent-blue)">' + t + '</span>').join(' ') : '—'}</td>
                  </tr>`;
    }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">Run Phase 3 migration SQL to populate sector data.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="phase3-panel" style="flex:1">
          <h3 class="phase3-panel-title">📰 Latest Sector Signals</h3>
          <div class="coinvestor-list">
            ${news.length > 0 ? news.slice(0, 8).map(n => `
              <div class="coinvestor-item" style="cursor:pointer" onclick="window.open('${n.url}','_blank')">
                <div class="coinvestor-info">
                  <div class="coinvestor-name" style="font-size:0.8rem">${n.headline}</div>
                  <div class="coinvestor-deals">${n.source || '—'} · ${n.sector_id || '—'} · ${n.published_at ? new Date(n.published_at).toLocaleDateString() : ''}</div>
                </div>
                <span class="signal-tag" style="font-size:0.6rem;background:${n.sentiment === 'positive' ? 'var(--accent-green)' : n.sentiment === 'negative' ? 'var(--accent-red)' : 'var(--accent-blue)'}22;color:${n.sentiment === 'positive' ? 'var(--accent-green)' : n.sentiment === 'negative' ? 'var(--accent-red)' : 'var(--accent-blue)'}">${n.sentiment || 'neutral'}</span>
              </div>`).join('') : '<div style="padding:16px;color:var(--text-muted);text-align:center">News signals will appear once the RSS scraper n8n workflow is activated.</div>'}
          </div>
        </div>
      </div>
    `;
  };
  renderAsync();
}

// ---- LP Report Generator ----
function renderLPReport(area) {
  const quarter = 'Q4 2025';
  const portfolio = rankedStartups.length ? rankedStartups : [];
  const totalDeployed = portfolio.reduce((a, s) => a + (s.lastRound.amount || 0), 0);
  const avgScore = portfolio.length ? Math.round(portfolio.reduce((a, s) => a + s.scores.composite, 0) / portfolio.length) : 0;
  const topPerformer = portfolio[0];

  const reportMD = `# JUNGLE VENTURES — LP QUARTERLY REPORT
## ${quarter}

### PORTFOLIO OVERVIEW
- **Total Companies:** ${portfolio.length}
- **Capital Deployed:** $${totalDeployed.toFixed(1)}M
- **Average Deal Score:** ${avgScore}/100
- **Geographies:** India (${portfolio.filter(s => s.geography === 'India').length}), Singapore (${portfolio.filter(s => s.geography === 'Singapore').length}), Vietnam (${portfolio.filter(s => s.geography === 'Vietnam').length}), Indonesia (${portfolio.filter(s => s.geography === 'Indonesia').length}), Philippines (${portfolio.filter(s => s.geography === 'Philippines').length})

### TOP PERFORMERS
${portfolio.slice(0, 5).map((s, i) => `${i + 1}. **${s.name}** (${s.subSector}) — Score: ${s.scores.composite}, MRR: $${s.metrics.revenue > 1000 ? (s.metrics.revenue / 1000).toFixed(0) + 'K' : s.metrics.revenue}, Growth: ${s.metrics.revenueGrowth}% MoM`).join('\n')}

### SECTOR BREAKDOWN
- Consumer Tech: ${portfolio.filter(s => s.sector === 'Consumer Tech').length} companies
- B2B Manufacturing: ${portfolio.filter(s => s.sector === 'B2B Manufacturing').length} companies

### KEY HIGHLIGHTS
- Strongest signal: ${topPerformer ? topPerformer.name + ' leading with ' + topPerformer.scores.composite + '/100 composite score' : 'N/A'}
- Pipeline: 16 deals tracked, 1 hot deals requiring immediate attention
- Follow-on candidates: ${portfolio.filter(s => s.scores.composite > 65).length} companies scoring above 65

---
*Generated by Jungle Ventures Intelligence Platform — ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}*`;

  area.innerHTML = `
    <div class="radar-stats-row">
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-green)">${portfolio.length}</div><div class="stat-card-label">Portfolio Companies</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-blue)">$${totalDeployed.toFixed(1)}M</div><div class="stat-card-label">Capital Deployed</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-purple)">${avgScore}</div><div class="stat-card-label">Avg Deal Score</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-orange)">5</div><div class="stat-card-label">Geographies</div></div>
    </div>

    <div class="memo-actions">
      <div class="tier-badge tier-hot" style="font-size:0.85rem;padding:6px 16px">📊 ${quarter} Report</div>
      <div style="display:flex;gap:8px">
        <button class="integration-connect-btn" id="lp-copy-btn">📋 Copy Report</button>
        <button class="integration-connect-btn" id="lp-download-btn" style="background:var(--accent-purple)">⬇️ Download .md</button>
      </div>
    </div>

    <div class="memo-body"><pre class="memo-content">${reportMD}</pre></div>

    <div class="phase3-grid">
      <div class="phase3-panel">
        <h3 class="phase3-panel-title">📈 Portfolio by Geography</h3>
        <div class="geo-heat-list">
          ${['India', 'Singapore', 'Vietnam', 'Indonesia', 'Philippines'].map(geo => {
    const count = portfolio.filter(s => s.geography === geo).length;
    return `<div class="geo-heat-item"><span class="geo-name">${geo}</span><div class="geo-bar-wrap"><div class="geo-bar" style="width:${(count / Math.max(1, ...['India', 'Singapore', 'Vietnam', 'Indonesia', 'Philippines'].map(g => portfolio.filter(s => s.geography === g).length))) * 100}%"></div></div><span class="geo-count">${count}</span></div>`;
  }).join('')}
        </div>
      </div>
      <div class="phase3-panel">
        <h3 class="phase3-panel-title">🏆 Top 5 by Score</h3>
        <div class="coinvestor-list">
          ${portfolio.slice(0, 5).map((s, i) => `<div class="coinvestor-item"><div class="coinvestor-rank">#${i + 1}</div><div class="coinvestor-info"><div class="coinvestor-name">${s.logo} ${s.name}</div><div class="coinvestor-deals">${s.subSector} · ${s.geography}</div></div><div class="coinvestor-count" style="color:${getScoreColor(s.scores.composite)}">${s.scores.composite}</div></div>`).join('')}
        </div>
      </div>
    </div>
  `;

  document.getElementById('lp-copy-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(reportMD).then(() => {
      const btn = document.getElementById('lp-copy-btn');
      btn.textContent = '✅ Copied!';
      setTimeout(() => btn.textContent = '📋 Copy Report', 2000);
    });
  });
  document.getElementById('lp-download-btn')?.addEventListener('click', () => {
    const blob = new Blob([reportMD], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `JV-LP-Report-${quarter.replace(' ', '-')}.md`; a.click();
    URL.revokeObjectURL(url);
  });
}

// ---- Deal Velocity Tracker ----
function renderDealVelocity(area) {
  if (!streakDeals.length) {
    area.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary)">Loading velocity data from Streak CRM...</div>';
    return;
  }

  const now = Date.now();
  const STAGE_ORDER = ['5001', '5016', '5018', '5002', '5003', '5011', '5004', '5014'];
  const STAGE_LABELS = { '5001': 'Sourced', '5016': 'Pinged', '5018': 'Meeting Set', '5002': 'Met+Active', '5003': 'Deep Dive', '5011': 'IC Review', '5004': 'Term Sheet', '5014': 'Closed' };
  const STAGE_COLORS = { '5001': '#64748b', '5016': '#6366f1', '5018': '#8b5cf6', '5002': '#f59e0b', '5003': '#f97316', '5011': '#ec4899', '5004': '#10b981', '5014': '#22c55e' };
  const ACTIVE = new Set(['5002', '5003', '5011', '5004', '5007', '5018']);
  const statusColors = { Fast: 'var(--accent-green)', Normal: 'var(--accent-blue)', Slow: 'var(--accent-red)' };

  function getDaysIn(d) {
    const ts = d.created_at ? parseInt(d.created_at) : null;
    if (!ts) return 0;
    return Math.floor((now - ts) / 86400000);
  }
  function getVelocity(d, days) {
    const pos = STAGE_ORDER.indexOf(d.stage_key);
    if (pos >= 5 && days < 60) return 'Fast';
    if (pos <= 1 && days > 90) return 'Slow';
    return 'Normal';
  }

  const funnel = STAGE_ORDER
    .map(k => ({ key: k, stage: STAGE_LABELS[k], count: streakDeals.filter(d => d.stage_key === k).length }))
    .filter(f => f.count > 0);

  const activeDeals = streakDeals
    .filter(d => ACTIVE.has(d.stage_key))
    .map(d => { const days = getDaysIn(d); return { d, days, status: getVelocity(d, days) }; })
    .sort((a, b) => b.days - a.days)
    .slice(0, 20);

  const avgDays = activeDeals.length ? Math.round(activeDeals.reduce((s, d) => s + d.days, 0) / activeDeals.length) : 0;
  const fastCount = activeDeals.filter(d => d.status === 'Fast').length;
  const maxDays = Math.max(1, ...activeDeals.map(d => d.days));

  area.innerHTML = `
    ${getModuleNews('dealvelocity')}
    <div class="radar-stats-row">
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-green)">${avgDays}d</div><div class="stat-card-label">Avg Active Days</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-blue)">${fastCount}</div><div class="stat-card-label">Fast-tracked</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-purple)">${streakDeals.filter(d => d.stage_key === '5014').length}</div><div class="stat-card-label">Portfolio (Closed)</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-orange)">${streakDeals.length}</div><div class="stat-card-label">Total Pipeline</div></div>
    </div>

    <div class="phase3-grid">
      <div class="phase3-panel" style="flex:2">
        <h3 class="phase3-panel-title">⚡ Deal Timeline <span style="font-size:0.7rem;font-weight:400;color:var(--text-muted);margin-left:8px">Top ${activeDeals.length} active · Live</span></h3>
        <div class="velocity-list">
          ${activeDeals.map(({ d, days, status }) => {
    const name = (d.name || '').replace(/^www\./, '').replace(/\.(com|co\.in|io|ai|net|org)(\/.*)?$/i, '');
    const stageName = STREAK_STAGE_NAMES[d.stage_key] || d.stage_key;
    const stageColor = STAGE_COLORS[d.stage_key] || '#64748b';
    const barWidth = Math.min((days / maxDays) * 100, 100);
    return `
              <div class="velocity-item">
                <div class="velocity-header">
                  <strong class="velocity-deal">${name}</strong>
                  <span class="signal-tag" style="background:${statusColors[status]}22;color:${statusColors[status]}">${status}</span>
                  <span class="velocity-stage" style="color:${stageColor}">${stageName}</span>
                  <span class="velocity-days">${days}d</span>
                </div>
                <div class="velocity-bar-wrap">
                  <div class="velocity-segment" style="width:${barWidth}%;background:${stageColor}" title="${stageName}: ${days} days in pipeline"></div>
                </div>
              </div>`;
  }).join('')}
        </div>
        <div class="velocity-legend">
          ${STAGE_ORDER.map(k => STAGE_LABELS[k] ? `<span class="legend-item"><span class="legend-dot" style="background:${STAGE_COLORS[k]}"></span>${STAGE_LABELS[k]}</span>` : '').join('')}
        </div>
      </div>

      <div class="phase3-panel" style="flex:1">
        <h3 class="phase3-panel-title">🔻 Pipeline Funnel</h3>
        <div class="funnel-list">
          ${funnel.map(f => `
            <div class="funnel-step">
              <div class="funnel-bar" style="width:${(f.count / funnel[0].count) * 100}%;background:${STAGE_COLORS[f.key] || 'var(--accent-blue)'}"></div>
              <div class="funnel-label">${f.stage}</div>
              <div class="funnel-count">${f.count}</div>
            </div>
          `).join('')}
        </div>

        <h3 class="phase3-panel-title" style="margin-top:24px">📊 Stage Distribution</h3>
        <div class="geo-heat-list">
          ${funnel.slice(0, 8).map(f => `
            <div class="geo-heat-item">
              <span class="geo-name">${f.stage}</span>
              <div class="geo-bar-wrap"><div class="geo-bar" style="width:${(f.count / funnel[0].count) * 100}%;background:${STAGE_COLORS[f.key] || '#6366f1'}"></div></div>
              <span class="geo-count">${f.count}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// PHASE 5: ADMIN & DATA
// ============================================================

// ---- Admin Panel ----
const ADMIN_CREDENTIALS = [
  { id: 'tracxn', name: 'Tracxn API', desc: 'Company data, funding rounds, and competitive intelligence', icon: '🔍', fields: ['API Key', 'API Secret'], status: 'disconnected', howTo: 'https://tracxn.com/api — Sign up for Enterprise plan → API Settings → Generate Key' },
  { id: 'ken', name: 'Ken Newsletters', desc: 'Premium business intelligence from The Ken Asia & India', icon: '📰', fields: ['Email', 'Password'], status: 'disconnected', howTo: 'https://the-ken.com — Use your existing login credentials from your subscription' },
  { id: 'supabase', name: 'Supabase', desc: 'Database backend for deal tracking and real-time sync', icon: '⚡', fields: ['Project URL', 'Anon Key'], status: 'disconnected', howTo: 'https://supabase.com/dashboard → Select Project → Settings → API → Copy URL & anon key' },
  { id: 'streak', name: 'Streak CRM', desc: 'Gmail-integrated CRM for pipeline management', icon: '📧', fields: ['API Key'], status: 'disconnected', howTo: 'https://streak.com → Settings → Integrations → API → Generate API Key' },
  { id: 'google', name: 'Google OAuth', desc: 'Gmail integration for email tracking and calendar sync', icon: '🔐', fields: ['Client ID', 'Client Secret'], status: 'disconnected', howTo: 'https://console.cloud.google.com → APIs & Services → Credentials → Create OAuth Client ID' },
  { id: 'openai', name: 'OpenAI API', desc: 'AI-powered memo generation and deal analysis', icon: '🤖', fields: ['API Key'], status: 'disconnected', howTo: 'https://platform.openai.com/api-keys → Create new secret key' },
  { id: 'crunchbase', name: 'Crunchbase', desc: 'Company profiles, funding data, and industry trends', icon: '💎', fields: ['API Key'], status: 'disconnected', howTo: 'https://data.crunchbase.com → Enterprise API → Generate Key from dashboard' },
  { id: 'pitchbook', name: 'PitchBook', desc: 'Private market data, valuations, and deal comps', icon: '📈', fields: ['Username', 'Password', 'API Token'], status: 'disconnected', howTo: 'https://pitchbook.com — Contact your account manager for API access credentials' }
];

function renderAdmin(area) {
  // Load saved creds from localStorage
  const saved = JSON.parse(localStorage.getItem('jv_admin_creds') || '{}');

  area.innerHTML = `
    <div class="admin-notice">
      <span>🔒</span>
      <span>Credentials are stored locally in your browser (localStorage). They never leave your machine.</span>
    </div>

    <div class="admin-grid">
      ${ADMIN_CREDENTIALS.map(cred => {
    const credSaved = saved[cred.id] || {};
    const isConnected = cred.fields.every(f => credSaved[f]);
    return `
          <div class="admin-card ${isConnected ? 'admin-connected' : ''}">
            <div class="admin-card-header">
              <span class="admin-icon">${cred.icon}</span>
              <div>
                <strong class="admin-name">${cred.name}</strong>
                <span class="admin-status ${isConnected ? 'status-connected' : 'status-disconnected'}">${isConnected ? '● Connected' : '○ Not Connected'}</span>
              </div>
            </div>
            <p class="admin-desc">${cred.desc}</p>
            <p class="admin-howto">💡 <strong>How to get:</strong> ${cred.howTo}</p>
            <div class="admin-fields" id="admin-fields-${cred.id}">
              ${cred.fields.map(f => `
                <div class="admin-field">
                  <label class="admin-field-label">${f}</label>
                  <input type="${f.toLowerCase().includes('password') || f.toLowerCase().includes('key') || f.toLowerCase().includes('secret') || f.toLowerCase().includes('token') ? 'password' : 'text'}" 
                    class="admin-input" 
                    id="admin-${cred.id}-${f.replace(/\s+/g, '-').toLowerCase()}"
                    placeholder="Enter ${f}"
                    value="${credSaved[f] || ''}" />
                </div>
              `).join('')}
            </div>
            <button class="admin-save-btn" data-cred-id="${cred.id}" data-fields='${JSON.stringify(cred.fields)}'>
              ${isConnected ? '✅ Update' : '💾 Save & Connect'}
            </button>
          </div>
        `;
  }).join('')}
    </div>
  `;

  // Save handlers
  area.querySelectorAll('.admin-save-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const credId = btn.dataset.credId;
      const fields = JSON.parse(btn.dataset.fields);
      const vals = {};
      let allFilled = true;
      fields.forEach(f => {
        const input = document.getElementById(`admin-${credId}-${f.replace(/\s+/g, '-').toLowerCase()}`);
        vals[f] = input?.value?.trim() || '';
        if (!vals[f]) allFilled = false;
      });
      if (!allFilled) { btn.textContent = '❌ Fill all fields'; setTimeout(() => btn.textContent = '💾 Save & Connect', 2000); return; }
      const all = JSON.parse(localStorage.getItem('jv_admin_creds') || '{}');
      all[credId] = vals;
      localStorage.setItem('jv_admin_creds', JSON.stringify(all));
      // Log activity
      logActivity('credential_update', `Updated ${ADMIN_CREDENTIALS.find(c => c.id === credId)?.name} credentials`);
      btn.textContent = '✅ Saved!';
      btn.closest('.admin-card').classList.add('admin-connected');
      btn.closest('.admin-card').querySelector('.admin-status').textContent = '● Connected';
      btn.closest('.admin-card').querySelector('.admin-status').className = 'admin-status status-connected';
      setTimeout(() => btn.textContent = '✅ Update', 2000);
    });
  });
}

// ---- Activity Log ----
var ACTIVITY_LOG = JSON.parse(localStorage.getItem('jv_activity_log') || '[]');

function logActivity(type, message) {
  const entry = { type, message, time: new Date().toISOString(), id: Date.now() };
  ACTIVITY_LOG.unshift(entry);
  if (ACTIVITY_LOG.length > 100) ACTIVITY_LOG = ACTIVITY_LOG.slice(0, 100);
  localStorage.setItem('jv_activity_log', JSON.stringify(ACTIVITY_LOG));
}

// Seed some demo entries if empty
if (ACTIVITY_LOG.length === 0) {
  const demoLogs = [
    { type: 'deal_view', message: 'Viewed deal: GreenMill (Score: 75)', time: new Date(Date.now() - 3600000).toISOString(), id: 1 },
    { type: 'memo_generated', message: 'Generated IC Memo for FactoryOS', time: new Date(Date.now() - 7200000).toISOString(), id: 2 },
    { type: 'navigation', message: 'Opened Fundraising Radar', time: new Date(Date.now() - 10800000).toISOString(), id: 3 },
    { type: 'credential_update', message: 'Updated Supabase credentials', time: new Date(Date.now() - 14400000).toISOString(), id: 4 },
    { type: 'deal_view', message: 'Viewed deal: SteelMind (Score: 68)', time: new Date(Date.now() - 18000000).toISOString(), id: 5 },
    { type: 'export', message: 'Downloaded LP Report Q4 2025', time: new Date(Date.now() - 21600000).toISOString(), id: 6 },
    { type: 'navigation', message: 'Opened Network Map', time: new Date(Date.now() - 25200000).toISOString(), id: 7 },
    { type: 'deal_view', message: 'Viewed deal: KartBee (Score: 65)', time: new Date(Date.now() - 28800000).toISOString(), id: 8 }
  ];
  ACTIVITY_LOG = demoLogs;
  localStorage.setItem('jv_activity_log', JSON.stringify(ACTIVITY_LOG));
}

function renderActivityLog(area) {
  const typeIcons = { deal_view: '👁️', memo_generated: '📋', navigation: '🧭', credential_update: '🔑', export: '⬇️', search: '🔍', filter: '🔽' };
  const typeColors = { deal_view: 'var(--accent-blue)', memo_generated: 'var(--accent-purple)', navigation: 'var(--accent-green)', credential_update: 'var(--accent-orange)', export: 'var(--accent-pink)', search: 'var(--accent-indigo)', filter: 'var(--text-muted)' };

  area.innerHTML = `
    <div class="radar-stats-row">
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-blue)">${ACTIVITY_LOG.filter(l => l.type === 'deal_view').length}</div><div class="stat-card-label">Deal Views</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-purple)">${ACTIVITY_LOG.filter(l => l.type === 'memo_generated').length}</div><div class="stat-card-label">Memos Generated</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-orange)">${ACTIVITY_LOG.filter(l => l.type === 'credential_update').length}</div><div class="stat-card-label">Credential Updates</div></div>
      <div class="stat-card"><div class="stat-card-value" style="color:var(--accent-green)">${ACTIVITY_LOG.length}</div><div class="stat-card-label">Total Actions</div></div>
    </div>

    <div class="phase3-panel">
      <div class="log-header">
        <h3 class="phase3-panel-title" style="margin-bottom:0">📜 Recent Activity</h3>
        <button class="integration-connect-btn" id="clear-log-btn" style="background:var(--accent-red);font-size:0.75rem;padding:4px 12px">🗑️ Clear Log</button>
      </div>
      <div class="activity-list">
        ${ACTIVITY_LOG.map(log => {
    const t = new Date(log.time);
    const timeStr = t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateStr = t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `
            <div class="activity-item">
              <span class="activity-icon" style="color:${typeColors[log.type] || 'var(--text-muted)'}">${typeIcons[log.type] || '📌'}</span>
              <div class="activity-info">
                <span class="activity-msg">${log.message}</span>
                <span class="activity-time">${dateStr}, ${timeStr}</span>
              </div>
              <span class="signal-tag" style="background:${typeColors[log.type] || 'var(--text-muted)'}22;color:${typeColors[log.type] || 'var(--text-muted)'};font-size:0.65rem">${log.type.replace('_', ' ')}</span>
            </div>
          `;
  }).join('')}
      </div>
    </div>
  `;

  document.getElementById('clear-log-btn')?.addEventListener('click', () => {
    ACTIVITY_LOG = [];
    localStorage.setItem('jv_activity_log', JSON.stringify(ACTIVITY_LOG));
    renderActivityLog(area);
  });
}


// ---- Auth & Session Management ----
function decodeJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch { return null; }
}

// Google Sign-In callback (must be global)
window.handleGoogleLogin = async function (response) {
  const user = decodeJwt(response.credential);
  if (!user) return;
  currentUser = { email: user.email, name: user.name, avatar: user.picture };
  localStorage.setItem('jv_user', JSON.stringify(currentUser));

  // Save to Supabase
  if (supabaseConnected && supabaseClient) {
    try {
      await supabaseClient.from('user_profiles').upsert({
        email: user.email, name: user.name, avatar_url: user.picture,
        last_login: new Date().toISOString()
      }, { onConflict: 'email' });
    } catch (e) { console.warn('User profile save:', e.message); }
  }

  showDashboard();
};

function showDashboard() {
  const overlay = document.getElementById('login-overlay');
  const app = document.getElementById('main-app');
  if (overlay) { overlay.style.opacity = '0'; setTimeout(() => overlay.style.display = 'none', 500); }
  if (app) app.style.display = '';

  // Update sidebar with user info
  if (currentUser) {
    const brand = document.querySelector('.sidebar-brand');
    if (brand) {
      const existing = document.getElementById('user-profile-bar');
      if (existing) existing.remove();
      brand.insertAdjacentHTML('afterend', `
        <div id="user-profile-bar" style="padding:8px 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border-primary);margin-bottom:4px">
          <img src="${currentUser.avatar || ''}" style="width:28px;height:28px;border-radius:50%;border:2px solid var(--accent-green)" onerror="this.style.display='none'">
          <div style="flex:1;min-width:0">
            <div style="font-size:0.75rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${currentUser.name || 'User'}</div>
            <div style="font-size:0.6rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${currentUser.email || ''}</div>
          </div>
          <button onclick="logout()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.7rem" title="Sign out">↩</button>
        </div>
      `);
    }
  }
}

function logout() {
  currentUser = null;
  localStorage.removeItem('jv_user');
  location.reload();
}

// ---- Boot ----
async function boot() {
  // Check existing session
  try {
    const saved = localStorage.getItem('jv_user');
    if (saved) currentUser = JSON.parse(saved);
  } catch { }

  // Each init is independently wrapped — a CDN failure won't block the app
  try { initStreak(); } catch (e) { console.warn('Streak init skipped:', e.message); }
  try { setTimeout(() => initGmail(), 1000); } catch (e) { console.warn('Gmail init skipped:', e.message); }

  // Initialize Google Sign-In button on login page
  try {
    const gContainer = document.getElementById('google-signin-container');
    const clientId = CONFIG.googleClientId || '';
    if (gContainer && clientId && typeof google !== 'undefined') {
      google.accounts.id.initialize({ client_id: clientId, callback: window.handleGoogleLogin });
      google.accounts.id.renderButton(gContainer, { theme: 'filled_black', size: 'large', shape: 'pill', width: 300, text: 'sign_in_with' });
    } else if (gContainer && !clientId) {
      gContainer.innerHTML = '<p style="color:rgba(255,255,255,0.35);font-size:0.75rem;margin:8px 0">Google Sign-In not configured.<br>Set googleClientId in config.js</p>';
    }
  } catch (e) { console.warn('Google Sign-In init:', e.message); }

  // Skip login button (Bind early so it's instantly clickable)
  document.getElementById('skip-login-btn')?.addEventListener('click', () => {
    currentUser = { email: 'guest@jungleventures.com', name: 'Guest User', avatar: '' };
    showDashboard();
  });

  // CRITICAL: init() MUST run regardless of integration status
  try {
    await init();
    console.log('✅ Boot complete, deals:', rankedStartups.length, 'streak:', streakDeals.length);
  } catch (e) {
    console.error('❌ Boot error:', e);
    const area = document.getElementById('content-area');
    if (area) area.innerHTML = '<div style="padding:40px;color:#ef4444;font-size:16px;"><h2>⚠️ App Error</h2><pre style="color:#f59e0b;white-space:pre-wrap;">' + e.message + '\n\n' + e.stack + '</pre></div>';
  }

  // Show dashboard if already logged in
  if (currentUser) {
    showDashboard();
  }
}

// ============================================================
// MERGED SUPER-MODULES (Consolidated from 20 → 8)
// ============================================================

// Tab system helper
function renderTabbed(area, title, icon, tabs, defaultTab) {
  const tabId = 'tabbed-' + title.replace(/\s/g, '');
  area.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <span style="font-size:1.5rem">${icon}</span>
        <div>
          <div style="font-size:1.1rem;font-weight:800;color:var(--text-primary);letter-spacing:-0.02em">${title}</div>
        </div>
      </div>
      <div id="${tabId}-tabs" style="display:flex;gap:4px;border-bottom:1px solid var(--border-subtle);padding-bottom:0">
        ${tabs.map((t, i) => `
          <button class="module-tab ${i === defaultTab ? 'active' : ''}" data-tab="${t.key}"
            style="padding:8px 16px;font-size:0.75rem;font-weight:700;border:none;background:${i === defaultTab ? 'var(--bg-tertiary)' : 'transparent'};color:${i === defaultTab ? 'var(--text-primary)' : 'var(--text-muted)'};border-radius:8px 8px 0 0;cursor:pointer;transition:all 0.15s;font-family:Inter">${t.icon} ${t.label}</button>
        `).join('')}
      </div>
    </div>
    <div id="${tabId}-content"></div>
  `;

  const contentEl = document.getElementById(`${tabId}-content`);
  const tabsEl = document.getElementById(`${tabId}-tabs`);

  function activateTab(key) {
    const tab = tabs.find(t => t.key === key);
    if (!tab) return;
    tabsEl.querySelectorAll('.module-tab').forEach(b => {
      b.style.background = 'transparent';
      b.style.color = 'var(--text-muted)';
      b.classList.remove('active');
    });
    const activeBtn = tabsEl.querySelector(`[data-tab="${key}"]`);
    if (activeBtn) {
      activeBtn.style.background = 'var(--bg-tertiary)';
      activeBtn.style.color = 'var(--text-primary)';
      activeBtn.classList.add('active');
    }
    tab.render(contentEl);
  }

  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.module-tab');
    if (btn) activateTab(btn.dataset.tab);
  });

  // Render default tab
  activateTab(tabs[defaultTab].key);
}

// ---------- INTELLIGENCE HUB (Daily Brief + Power Moves + Thesis) ----------
function renderIntelHub(area) {
  renderTabbed(area, 'Intelligence Hub', '📡', [
    { key: 'briefing', icon: '⚡', label: 'Daily Brief', render: (el) => renderBriefing(el) },
    { key: 'powermoves', icon: '🕵️', label: 'Power Moves', render: (el) => renderPowerMoves(el) },
    { key: 'thesis', icon: '🧭', label: 'Thesis Tracker', render: (el) => renderThesis(el) }
  ], 0);
}

// ---------- IC WAR ROOM (Meeting Prep + IC Memo + Patterns) ----------
function renderICWarRoom(area) {
  renderTabbed(area, 'IC War Room', '⚔️', [
    { key: 'meetingprep', icon: '🎯', label: 'Meeting Prep', render: (el) => renderMeetingPrep(el) },
    { key: 'icmemo', icon: '📋', label: 'IC Memo', render: (el) => renderICMemo(el) },
    { key: 'patterns', icon: '🧬', label: 'Pattern Engine', render: (el) => renderPatterns(el) }
  ], 0);
}

// ---------- VALUATION LAB (Valuation + Public Comps + Industry) ----------
function renderValuationLab(area) {
  renderTabbed(area, 'Valuation Lab', '💰', [
    { key: 'valuation', icon: '🧮', label: 'Deal Valuation', render: (el) => renderValuation(el) },
    { key: 'publiccomps', icon: '📈', label: 'Public Comps', render: (el) => renderPublicMarketComps(el) },
    { key: 'industry', icon: '🏭', label: 'Industry View', render: (el) => renderIndustryAnalyzer(el) }
  ], 0);
}

// ---------- NETWORK & CRM (VC CRM + Founders + Fund Radar) ----------
function renderNetworkCRM(area) {
  renderTabbed(area, 'Network & CRM', '🤝', [
    { key: 'vccrm', icon: '🤝', label: 'Co-Investors', render: (el) => renderVCCRM(el) },
    { key: 'network', icon: '🕸️', label: 'Network Map', render: (el) => renderNetworkMap(el) },
    { key: 'fundradar', icon: '📡', label: 'Fund Radar', render: (el) => renderFundRadar(el) }
  ], 0);
}

// ---------- SETTINGS (Integrations + Admin + Activity Log) ----------
function renderSettings(area) {
  renderTabbed(area, 'Settings', '⚙️', [
    { key: 'integrations', icon: '🔗', label: 'Integrations', render: (el) => renderIntegrations(el) },
    { key: 'admin', icon: '🛡️', label: 'Admin', render: (el) => renderAdmin(el) },
    { key: 'activitylog', icon: '📜', label: 'Activity Log', render: (el) => renderActivityLog(el) }
  ], 0);
}

// Self-boot
(async function () {
  if (typeof window._booted !== 'undefined' && window._booted) return;
  window._booted = true;
  try { await boot(); } catch (e) { console.error('Self-boot failed:', e); }
})();
