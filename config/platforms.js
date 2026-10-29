// The one place that lists the review platforms. Adding a platform = one entry here + its collector adapter (collector/models/<id>*.js
// and its routes); the dashboard, the posting queue, the filters, the colours and the n8n workflows all read this list.
//   name / color / tint   how the dashboard shows it (badge, tabs, charts)
//   login / ownerUrl      what to run to sign in again, and the page where a person answers reviews by hand
//   autoReply             true = the posting queue may post approved replies there by itself
//   workflow              the n8n workflow generated for it (workflows/build.js): id, schedule (cron), collector routes, reviews per run
module.exports = {
  google: {
    name: 'Google', color: '#1a63d6', tint: '#e7effc',
    login: 'npm run login', ownerUrl: 'https://business.google.com/reviews', autoReply: true,
    workflow: {
      id: 'gbpReviewMonitor1', name: 'Google Business Profile Review Monitor', file: 'google-reviews.json', cron: '0 9 * * *',
      businesses: '/businesses', reviews: '/reviews', perRun: 30, perRunNote: 'newest reviews read per run, all businesses together',
    },
  },
  tripadvisor: {
    name: 'Tripadvisor', color: '#00785a', tint: '#e0f5ee',
    login: 'npm run login -- tripadvisor', ownerUrl: 'https://www.tripadvisor.com.vn/Owners', autoReply: true,
    workflow: {
      id: 'tripadvisorReviewMonitor1', name: 'Tripadvisor Review Monitor', file: 'tripadvisor-reviews.json', cron: '30 9 * * *',
      businesses: '/tripadvisor/businesses', reviews: '/tripadvisor/reviews', perRun: 5, perRunNote: 'NEW (not yet stored) reviews taken per property per run, newest first; raise it once for a backfill',
    },
  },
};
