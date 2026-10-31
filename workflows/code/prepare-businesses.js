const cfg = $('Config').first().json;
const businesses = [...$input.first().json.businesses].sort((a, b) => String(a.business_identifier).localeCompare(String(b.business_identifier), 'en', { numeric: true }));
return businesses.map((business, index) => ({ json: { ...business,
  // Keep Google's existing total budget; other sources already have a per-property budget.
  business_limit: cfg.platform === 'google' ? Math.floor(cfg.reviewsPerRun / businesses.length) + (index < cfg.reviewsPerRun % businesses.length ? 1 : 0) : cfg.reviewsPerRun,
} }));
