// ============================================================
// Jungle Ventures — SVG Chart Helpers
// Sparklines, Radar Charts, Score Indicators
// ============================================================

function createSparkline(data, color = '#10b981', width = 80, height = 30) {
  if (!data || data.length < 2) return '';
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const gradientId = `sg-${Math.random().toString(36).slice(2, 8)}`;

  return `
    <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="0,${height} ${points.join(' ')} ${width},${height}"
        fill="url(#${gradientId})" />
      <polyline points="${points.join(' ')}"
        fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${(data.length - 1) / (data.length - 1) * width}" cy="${height - ((data[data.length - 1] - min) / range) * (height - 4) - 2}"
        r="2.5" fill="${color}" />
    </svg>
  `;
}

function createRadarChart(dimensions, size = 240) {
  const labels = [
    { key: 'marketSize', label: 'Market' },
    { key: 'founderPedigree', label: 'Founders' },
    { key: 'earlyTraction', label: 'Traction' },
    { key: 'productDifferentiation', label: 'Product' },
    { key: 'fundability', label: 'Fundability' }
  ];

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.38;
  const n = labels.length;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;

  // Grid rings
  let gridRings = '';
  for (let r = 1; r <= 4; r++) {
    const radius = (r / 4) * maxR;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep;
      pts.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
    }
    gridRings += `<polygon points="${pts.join(' ')}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
  }

  // Axis lines
  let axes = '';
  for (let i = 0; i < n; i++) {
    const angle = startAngle + i * angleStep;
    const ex = cx + maxR * Math.cos(angle);
    const ey = cy + maxR * Math.sin(angle);
    axes += `<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
  }

  // Data polygon
  const dataPts = labels.map((l, i) => {
    const val = (dimensions[l.key] || 0) / 100;
    const angle = startAngle + i * angleStep;
    const r = val * maxR;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  });

  // Labels
  let labelEls = '';
  labels.forEach((l, i) => {
    const angle = startAngle + i * angleStep;
    const lr = maxR + 22;
    const lx = cx + lr * Math.cos(angle);
    const ly = cy + lr * Math.sin(angle);
    const val = dimensions[l.key] || 0;
    labelEls += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" fill="#94a3b8" font-size="10" font-family="Inter" font-weight="600">${l.label}</text>`;
    labelEls += `<text x="${lx}" y="${ly + 13}" text-anchor="middle" dominant-baseline="middle" fill="#10b981" font-size="11" font-family="JetBrains Mono" font-weight="700">${val}</text>`;
  });

  // Data dots
  let dataDots = '';
  labels.forEach((l, i) => {
    const val = (dimensions[l.key] || 0) / 100;
    const angle = startAngle + i * angleStep;
    const r = val * maxR;
    dataDots += `<circle cx="${cx + r * Math.cos(angle)}" cy="${cy + r * Math.sin(angle)}" r="3.5" fill="#10b981" stroke="#0a0e1a" stroke-width="2"/>`;
  });

  return `
    <svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      ${gridRings}
      ${axes}
      <defs>
        <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#14b8a6" stop-opacity="0.08"/>
        </linearGradient>
      </defs>
      <polygon points="${dataPts.join(' ')}" fill="url(#radarFill)" stroke="#10b981" stroke-width="2" stroke-linejoin="round"/>
      ${dataDots}
      ${labelEls}
    </svg>
  `;
}

function getScoreColor(score) {
  if (score >= 75) return '#10b981';
  if (score >= 55) return '#f59e0b';
  return '#6366f1';
}

function getScoreClass(score) {
  if (score >= 75) return 'score-hot';
  if (score >= 55) return 'score-warm';
  return 'score-watch';
}

function getBarColor(score) {
  if (score >= 80) return 'var(--accent-emerald)';
  if (score >= 60) return 'var(--accent-teal)';
  if (score >= 40) return 'var(--accent-amber)';
  return 'var(--accent-indigo)';
}

// Globals: createSparkline, createRadarChart, getScoreColor, getScoreClass, getBarColor
