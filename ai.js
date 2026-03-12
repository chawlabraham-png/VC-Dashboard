// ============================================================
// Jungle Ventures — Centralized AI Layer
// Uses GPT-4o (fast) and o1 (deep reasoning) via OpenAI API
// ============================================================

const AI_MODELS = {
  fast: 'gpt-4o',        // For speed tasks: deck analysis, enrichment, briefs
  reasoning: 'o1',        // For deep tasks: valuations, LP reports
  cheap: 'gpt-4o-mini'   // For high-volume: news classification
};

/**
 * Core GPT call. All modules go through this.
 * @param {string} prompt - The user/system prompt
 * @param {object} options - { model, systemPrompt, jsonMode, maxTokens }
 * @returns {string|object} - AI response text or parsed JSON
 */
async function callGPT(prompt, options = {}) {
  const apiKey = CONFIG.openaiApiKey || '';
  if (!apiKey) {
    console.warn('⚠️ OpenAI API key not configured');
    return options.jsonMode ? {} : 'AI analysis unavailable — add your OpenAI API key in config.js';
  }

  const model = options.model || AI_MODELS.fast;
  const maxTokens = options.maxTokens || 4096;

  const messages = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  // For o1 model, system prompts go as user messages (o1 doesn't support system role directly)
  if (model === 'o1' && options.systemPrompt) {
    messages.length = 0;
    messages.push({ role: 'user', content: options.systemPrompt + '\n\n' + prompt });
  } else {
    messages.push({ role: 'user', content: prompt });
  }

  const body = {
    model,
    messages,
  };

  // o1 doesn't support max_tokens or response_format
  if (model !== 'o1') {
    body.max_tokens = maxTokens;
    if (options.jsonMode) {
      body.response_format = { type: 'json_object' };
    }
  }

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('OpenAI API error:', resp.status, errText);
      return options.jsonMode ? {} : `AI error (${resp.status})`;
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (options.jsonMode) {
      try { return JSON.parse(content); } catch { return {}; }
    }
    return content;
  } catch (err) {
    console.error('GPT call failed:', err);
    return options.jsonMode ? {} : 'AI request failed. Check your connection.';
  }
}

// ============================================================
// Module 2: Deck Analyzer — Real AI Scoring
// ============================================================
async function aiAnalyzeDeck(pdfText, fileName) {
  const systemPrompt = `You are a senior VC analyst at a top-tier venture capital firm. You analyze startup pitch decks and provide structured scoring.

You must return a JSON object with this exact structure:
{
  "overall_score": <number 0-100>,
  "verdict": "<STRONG PASS|PASS|REVIEW|SOFT PASS|HARD PASS>",
  "summary": "<2-3 sentence executive summary>",
  "scores": {
    "problem": <0-100>,
    "solution": <0-100>,
    "market": <0-100>,
    "traction": <0-100>,
    "team": <0-100>,
    "business_model": <0-100>,
    "financials": <0-100>,
    "ask": <0-100>
  },
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "red_flags": ["<flag 1>", "<flag 2>"],
  "key_metrics": { "tam": "<TAM if mentioned>", "revenue": "<revenue if mentioned>", "growth": "<growth if mentioned>" },
  "recommendation": "<1-2 sentence recommendation for the investment committee>"
}`;

  return await callGPT(
    `Analyze this pitch deck content and score it:\n\nFile: ${fileName}\n\n${pdfText.substring(0, 12000)}`,
    { systemPrompt, jsonMode: true, model: AI_MODELS.fast, maxTokens: 2000 }
  );
}

// ============================================================
// Module 7: Daily Intelligence Brief
// ============================================================
async function aiDailyBrief(newsSignals, streakDeals, portfolioMetrics) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Build context from real data
  const newsContext = (newsSignals || []).slice(0, 15).map(s =>
    `- [${s.type || 'news'}] ${s.title}: ${s.summary || s.ai_summary || ''}`
  ).join('\n');

  const staleDeals = (streakDeals || []).filter(d => {
    const ts = d.last_email_timestamp ? parseInt(d.last_email_timestamp) : 0;
    return ts > 0 && (Date.now() - ts) > 14 * 86400000; // 14+ days stale
  }).slice(0, 10).map(d => `- ${d.name} (last contact: ${new Date(parseInt(d.last_email_timestamp)).toLocaleDateString()})`).join('\n');

  const atRisk = (portfolioMetrics || []).filter(m => m.health_status === 'At Risk')
    .map(m => `- ${m.company_name}: ARR $${m.arr || 'N/A'}, Runway ${m.cash_runway_mo || '?'} months`).join('\n');

  const systemPrompt = `You are the AI Chief of Staff for Jungle Ventures, a leading Southeast Asian VC firm. Generate a sharp, actionable morning intelligence brief for the partners.

Format your response as HTML (not markdown). Use these sections:
1. <h3>🌅 Executive Summary</h3> — 3-4 bullet points of the most important things today
2. <h3>📰 Market Intelligence</h3> — Key news signals and what they mean for the portfolio
3. <h3>⚠️ Attention Required</h3> — Stale deals needing follow-up, at-risk companies
4. <h3>🎯 Today's Action Items</h3> — 3-5 specific actions the partners should take today

Keep it punchy. No fluff. Every sentence should be actionable or insightful.`;

  return await callGPT(
    `Generate the morning brief for ${dateStr}.

RECENT NEWS SIGNALS:
${newsContext || 'No recent signals available.'}

STALE DEALS (14+ days no contact):
${staleDeals || 'All deals are actively engaged.'}

AT-RISK PORTFOLIO COMPANIES:
${atRisk || 'No companies flagged at risk.'}

Total active Streak deals: ${(streakDeals || []).length}
Total portfolio companies tracked: ${(portfolioMetrics || []).length}`,
    { systemPrompt, model: AI_MODELS.fast, maxTokens: 3000 }
  );
}

// ============================================================
// Module 10: IC Memo Generator
// ============================================================
async function aiGenerateICMemo(dealData, enrichmentData, newsSignals) {
  const systemPrompt = `You are a senior investment analyst at Jungle Ventures. Draft a professional Investment Committee memo.

Format your response as clean HTML with these sections:
1. <h3>INVESTMENT COMMITTEE MEMO</h3>
2. <h4>Company Overview</h4> — What they do, stage, geography
3. <h4>Market Opportunity</h4> — TAM/SAM, market dynamics, timing
4. <h4>Traction & Metrics</h4> — Revenue, growth, users, unit economics
5. <h4>Team Assessment</h4> — Founders, background, team strength
6. <h4>Competitive Landscape</h4> — Key competitors, moat, differentiation
7. <h4>Investment Thesis</h4> — Why now, why us, what's the angle
8. <h4>Key Risks</h4> — Top 3-5 risks with mitigation strategies
9. <h4>IC Recommendation</h4> — PROCEED / LEAN POSITIVE / MONITOR / PASS with reasoning
10. <h4>Proposed Terms</h4> — Suggested check size, valuation range, structure

Be rigorous and data-driven. Challenge assumptions. Flag what's missing.`;

  const dealContext = dealData ? `
Company: ${dealData.name || 'Unknown'}
Stage: ${dealData.stage || 'Unknown'}
Industry: ${dealData.industry || dealData._industry || 'Unknown'}
Geography: ${dealData.country || dealData._country || 'Unknown'}
Description: ${dealData.description || 'No description available'}
Emails exchanged: ${(dealData.total_sent_emails || 0) + (dealData.total_received_emails || 0)}
Deal size: ${dealData.deal_size || 'Not specified'}
` : 'No deal data available.';

  const enrichContext = enrichmentData ? `
Founder: ${enrichmentData.founder_name || 'Unknown'}
Background: ${enrichmentData.founder_background || 'Unknown'}
Investors: ${(enrichmentData.investors || []).join(', ') || 'Unknown'}
Funding stage: ${enrichmentData.funding_stage || 'Unknown'}
Employee count: ${enrichmentData.employee_count || 'Unknown'}
` : '';

  const newsContext = (newsSignals || []).slice(0, 5).map(s => `- ${s.title}`).join('\n');

  return await callGPT(
    `Draft an IC memo for this deal:\n\n${dealContext}\n\n${enrichContext}\n\nRecent relevant news:\n${newsContext || 'None'}`,
    { systemPrompt, model: AI_MODELS.fast, maxTokens: 4000 }
  );
}

// ============================================================
// Module 3: Valuation Intelligence (uses o1 for reasoning)
// ============================================================
async function aiValuation(dealData, sectorComps) {
  const prompt = `You are a quantitative VC analyst. Compute a fair valuation range for this company.

Company: ${dealData.name || 'Unknown'}
Stage: ${dealData.stage || dealData.funding_stage || 'Unknown'}
Sector: ${dealData.industry || dealData.sector || 'Unknown'}
Geography: ${dealData.country || dealData.geography || 'Southeast Asia'}
Revenue/ARR: ${dealData.revenue || dealData.arr || 'Not disclosed'}
Growth rate: ${dealData.growth || 'Not disclosed'}
Last round: ${dealData.deal_size || dealData.lastRound || 'Not disclosed'}

Sector comparable median multiples (if available):
${sectorComps || 'Use your knowledge of current VC market multiples for this sector and stage.'}

Provide your analysis as JSON:
{
  "fair_value_low": "<$ amount>",
  "fair_value_high": "<$ amount>",
  "methodology": "<1-2 sentences explaining your approach>",
  "key_multiples": { "revenue_multiple": "<Nx>", "stage_premium": "<+/- %>", "geo_discount": "<+/- %>" },
  "verdict": "<UNDERPRICED|FAIR|OVERPRICED>",
  "confidence": "<HIGH|MEDIUM|LOW>",
  "comparable_companies": ["<company 1>", "<company 2>", "<company 3>"]
}`;

  return await callGPT(prompt, { model: AI_MODELS.fast, jsonMode: true, maxTokens: 1500 });
}

// ============================================================
// Module 17: LP Report Generator
// ============================================================
async function aiLPReport(portfolioMetrics, fundMetrics, quarter) {
  const systemPrompt = `You are the Head of Investor Relations at Jungle Ventures. Draft a professional LP quarterly update letter.

Format as clean HTML suitable for a fund report. Include:
1. <h3>Quarterly Letter to Limited Partners</h3>
2. <h4>Fund Performance Summary</h4>
3. <h4>Portfolio Highlights</h4> — Top performers, key milestones
4. <h4>New Investments</h4> — Deals closed this quarter
5. <h4>Market Outlook</h4> — Southeast Asia + India macro view
6. <h4>Key Metrics Table</h4> — HTML table with fund KPIs

Tone: Professional, confident, transparent. Acknowledge challenges honestly.`;

  const metricsContext = (portfolioMetrics || []).map(m =>
    `${m.company_name}: ARR $${m.arr || 'N/A'}, Growth ${m.growth_rate || 'N/A'}%, Health: ${m.health_status || 'N/A'}`
  ).join('\n');

  return await callGPT(
    `Draft the ${quarter || 'Q1 2026'} LP update letter.\n\nPortfolio Data:\n${metricsContext || 'Portfolio data pending upload.'}\n\nFund Metrics:\n${JSON.stringify(fundMetrics || {}, null, 2)}`,
    { systemPrompt, model: AI_MODELS.fast, maxTokens: 4000 }
  );
}

// ============================================================
// Module 6: Pattern Recognition Engine (Dynamic)
// ============================================================
async function aiDiscoverPatterns(streakDeals, dealEnrichments) {
  const activeDeals = (streakDeals || []).filter(d => ['5011', '5007', '5003', '5004'].includes(d.stage_key)); // Late stage
  const passedDeals = (streakDeals || []).filter(d => ['5014', '5005'].includes(d.stage_key)); // Passed/Lost

  // Build context payload limit to avoid token bloat
  const activePayload = activeDeals.slice(0, 10).map(d => {
    const enrich = dealEnrichments ? dealEnrichments[d.box_key] : null;
    return `[WIN/LATE] ${d.name} (${d.industry}): ${enrich ? (enrich.strengths || []).join(', ') : 'No data'}`;
  }).join('\\n');

  const passedPayload = passedDeals.slice(0, 10).map(d => {
    const enrich = dealEnrichments ? dealEnrichments[d.box_key] : null;
    return `[LOSS/PASS] ${d.name} (${d.industry}): ${enrich ? (enrich.risks || []).join(', ') : 'No data'}`;
  }).join('\\n');

  const prompt = `You are the lead Data Scientist at Jungle Ventures. Analyze the historical deal pipeline to identify strong predictive patterns for success vs passes.

LATE STAGE / PORTFOLIO DEALS:
${activePayload || 'No current data'}

PASSED / LOST DEALS:
${passedPayload || 'No current data'}

Provide your analysis as a JSON object:
{
  "insight": "<1 sentence overarching insight matching JV's thesis>",
  "winners": [
    {"text": "<Clear pattern seen in late stage companies>"},
    {"text": "<Another winning pattern (e.g. founder background, revenue velocity)>"},
    {"text": "<Market/timing pattern>"}
  ],
  "losers": [
    {"text": "<Clear red flag pattern leading to passes>"},
    {"text": "<Structural risk pattern>"},
    {"text": "<Competitive risk pattern>"}
  ]
}`;

  return await callGPT(prompt, { model: AI_MODELS.fast, jsonMode: true, maxTokens: 1000 });
}

// Global export
window.AI = {
  call: callGPT,
  analyzeDeck: aiAnalyzeDeck,
  dailyBrief: aiDailyBrief,
  generateICMemo: aiGenerateICMemo,
  valuation: aiValuation,
  lpReport: aiLPReport,
  classifySignal: aiClassifySignal,
  discoverPatterns: aiDiscoverPatterns,
  MODELS: AI_MODELS
};
