// ============================================================
// Jungle Ventures — Scoring Engine
// 5-Dimension scoring with composite ranking and thesis gen
// ============================================================

// Uses globals: STARTUPS, SIGNAL_TYPES (from data.js)

// Weights for composite score
var WEIGHTS = {
    marketSize: 0.20,
    founderPedigree: 0.25,
    earlyTraction: 0.25,
    productDifferentiation: 0.15,
    fundability: 0.15
};

function scoreMarketSize(startup) {
    const tamBillions = startup.tam;
    let score = Math.min(100, (tamBillions / 50) * 80);
    // Bonus for fast-growing sectors
    if (startup.metrics.revenueGrowth > 200) score = Math.min(100, score + 10);
    if (tamBillions > 30) score = Math.min(100, score + 10);
    return Math.round(score);
}

function scoreFounderPedigree(startup) {
    let score = 0;
    for (const f of startup.founders) {
        // Prior exits
        score += f.previousExits * 18;
        // Top company alumni
        const topCos = ['Google', 'Meta', 'Grab', 'Gojek', 'Flipkart', 'Swiggy', 'Sea Group', 'Shopee', 'Tokopedia',
            'Razorpay', 'CRED', 'Stripe', 'Siemens', 'Bosch', 'Tata', 'SAP', 'GE', 'ABB', 'Fanuc', 'Shell',
            'PayMaya', 'Ant Financial', 'Spotify', 'ShareChat', 'VNG', 'ByteDance'];
        const hasTop = topCos.some(c => f.pedigree.includes(c));
        if (hasTop) score += 15;
        // Elite education
        const eliteEd = ['IIT', 'Stanford', 'MIT', 'Wharton', 'Harvard', 'NUS', 'INSEAD', 'Berkeley', 'CMU', 'Columbia', 'IIM', 'ISI'];
        const hasElite = eliteEd.some(e => f.pedigree.includes(e));
        if (hasElite) score += 10;
        // VP/Director/Head level
        if (/VP|Director|Head|CTO|CDO|Country Head/i.test(f.pedigree)) score += 8;
        // PhD
        if (/PhD/i.test(f.pedigree)) score += 5;
    }
    return Math.min(100, Math.round(score));
}

function scoreEarlyTraction(startup) {
    const s = startup.signals;
    const m = startup.metrics;
    let score = 0;

    // Viral traction signal
    score += (s.viralTraction.score / 100) * 25;
    // App downloads signal
    score += (s.appDownloads.score / 100) * 25;
    // MAU growth
    if (m.mauGrowth > 400) score += 25;
    else if (m.mauGrowth > 200) score += 18;
    else if (m.mauGrowth > 100) score += 12;
    else score += 6;
    // Revenue growth
    if (m.revenueGrowth > 300) score += 25;
    else if (m.revenueGrowth > 200) score += 18;
    else if (m.revenueGrowth > 100) score += 12;
    else score += 6;

    return Math.min(100, Math.round(score));
}

function scoreProductDifferentiation(startup) {
    let score = 50; // Base
    const desc = startup.description.toLowerCase();

    // AI/ML moat
    if (/\bai\b|machine learning|computer vision|deep learning|nlp/i.test(desc)) score += 15;
    // Hardware + software
    if (/robot|iot|sensor|hardware/i.test(desc)) score += 12;
    // Platform/marketplace
    if (/platform|marketplace|ecosystem/i.test(desc)) score += 10;
    // Cost advantage
    if (/cheaper|lower cost|affordable|reduce.*cost/i.test(desc)) score += 8;
    // Network effects
    if (/social|community|creator|viral|multiplayer/i.test(desc)) score += 8;
    // GitHub activity indicates open-source moat
    if (startup.signals.githubActivity.score > 60) score += 8;

    return Math.min(100, Math.round(score));
}

function scoreFundability(startup) {
    let score = 0;
    const s = startup.signals;

    // Recent funding signal
    score += (s.angelFunding.score / 100) * 30;
    // Hiring momentum signals growth
    score += (s.hiringSpike.score / 100) * 15;
    // Founder exit quality
    score += (s.founderExit.score / 100) * 20;
    // Runway health
    if (startup.metrics.runway > 18) score += 20;
    else if (startup.metrics.runway > 12) score += 15;
    else if (startup.metrics.runway > 6) score += 10;
    else score += 5;
    // Sector heat bonus
    const hotSectors = ['Smart Factory', 'Visual Inspection', 'Creator Economy', 'Social Gaming', 'Predictive Maintenance', 'Sustainable'];
    if (hotSectors.some(s => startup.subSector.includes(s))) score += 15;

    return Math.min(100, Math.round(score));
}

function computeScores(startup) {
    const dimensions = {
        marketSize: scoreMarketSize(startup),
        founderPedigree: scoreFounderPedigree(startup),
        earlyTraction: scoreEarlyTraction(startup),
        productDifferentiation: scoreProductDifferentiation(startup),
        fundability: scoreFundability(startup)
    };

    const composite = Math.round(
        dimensions.marketSize * WEIGHTS.marketSize +
        dimensions.founderPedigree * WEIGHTS.founderPedigree +
        dimensions.earlyTraction * WEIGHTS.earlyTraction +
        dimensions.productDifferentiation * WEIGHTS.productDifferentiation +
        dimensions.fundability * WEIGHTS.fundability
    );

    let tier;
    if (composite >= 75) tier = { label: "Hot Deal", emoji: "🔥", class: "tier-hot" };
    else if (composite >= 55) tier = { label: "Warm", emoji: "⚡", class: "tier-warm" };
    else tier = { label: "Watch", emoji: "🧊", class: "tier-watch" };

    return { dimensions, composite, tier };
}

// ---- Investment Thesis Generator ----

function generateThesis(startup, scores) {
    const geo = startup.geography;
    const sector = startup.sector;
    const subSector = startup.subSector;
    const topSignal = Object.entries(startup.signals)
        .sort((a, b) => b[1].score - a[1].score)[0];
    const topSignalLabel = SIGNAL_TYPES.find(s => s.key === topSignal[0])?.label || topSignal[0];

    const founderStr = startup.founders.map(f => `${f.name} (${f.role})`).join(' and ');
    const tamStr = `$${startup.tam}B`;
    const tierStr = scores.tier.label.toLowerCase();
    const stageStr = startup.stage;

    const templates = [
        `${startup.name} is a ${tierStr} ${stageStr} ${subSector.toLowerCase()} opportunity in ${geo}'s ${tamStr} ${sector.toLowerCase()} market. Founded by ${founderStr}, the team brings deep domain expertise from top-tier companies. The strongest signal is ${topSignalLabel.toLowerCase()} — ${topSignal[1].detail.toLowerCase()}. With ${startup.metrics.mauGrowth}% MoM user growth and $${(startup.metrics.revenue / 1000).toFixed(0)}K monthly revenue growing ${startup.metrics.revenueGrowth}%, the company demonstrates strong product-market fit. Key risk: ${startup.metrics.runway < 12 ? 'limited runway requires near-term raise' : 'execution against well-funded incumbents'}. Recommend ${scores.composite >= 75 ? 'immediate partner meeting' : scores.composite >= 55 ? 'deep-dive diligence' : 'monitoring for next 60 days'}.`
    ];

    return templates[0];
}

// ---- Main: Score & Rank all startups ----

function rankStartups(startups) {
    return startups
        .map(s => {
            const scores = computeScores(s);
            const thesis = generateThesis(s, scores);
            return { ...s, scores, thesis };
        })
        .sort((a, b) => b.scores.composite - a.scores.composite)
        .map((s, i) => ({ ...s, rank: i + 1 }));
}

// Globals: computeScores, generateThesis, rankStartups, WEIGHTS
