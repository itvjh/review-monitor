const rows = $input.all().map(i => i.json);
const failed = rows.find(r => r.error);
return [{ json: failed ? { error: failed.error } : { known: rows.map(r => r.review_hash).filter(Boolean) }, pairedItem: { item: 0 } }];
