// The one place that lists the review platforms. Adding a platform = one entry here + its collector adapter (collector/models/<id>*.js
// and its routes); the dashboard, the posting queue, the filters, the colours and the n8n workflows all read this list.
//   name / logo / color / tint   how the dashboard shows it (badge, tabs, charts); logo = a file in dashboard/views/logos/
//   login / ownerUrl      what to run to sign in again, and the page where a person answers reviews by hand
//   autoReply             true = the posting queue may post approved replies there by itself
//   noGuestName           true = the AI never sees the reviewer's name (the platform forbids names in replies)
//   replyNote             (optional) a platform rule the AI must follow in replies, appended to the reply rules (workflow and "Tạo bản nháp")
//   workflow              the n8n workflow generated for it (workflows/build.js): id, schedule (cron), collector routes, reviews per run
module.exports = {
  google: {
    name: 'Google', logo: '/logos/google.svg', color: '#1a63d6', tint: '#e7effc',
    login: 'npm run login', ownerUrl: 'https://business.google.com/reviews', autoReply: true,
    workflow: {
      id: 'gbpReviewMonitor1', name: 'Google Business Profile Review Monitor', file: 'google-reviews.json', cron: '0 9 * * *',
      businesses: '/businesses', reviews: '/reviews', perRun: 30, perRunNote: 'newest reviews read per run, all businesses together',
    },
  },
  tripadvisor: {
    name: 'Tripadvisor', logo: '/logos/tripadvisor.svg', color: '#00785a', tint: '#e0f5ee',
    login: 'npm run login -- tripadvisor', ownerUrl: 'https://www.tripadvisor.com.vn/Owners', autoReply: true,
    workflow: {
      id: 'tripadvisorReviewMonitor1', name: 'Tripadvisor Review Monitor', file: 'tripadvisor-reviews.json', cron: '30 9 * * *',
      businesses: '/tripadvisor/businesses', reviews: '/tripadvisor/reviews', perRun: 5, perRunNote: 'NEW (not yet stored) reviews taken per property per run, newest first; raise it once for a backfill',
    },
  },
  traveloka: {
    name: 'Traveloka', logo: '/logos/traveloka.svg', color: '#008acb', tint: '#e0f4ff',
    login: 'npm run login -- traveloka', ownerUrl: 'https://tera.traveloka.com/vi-vn/guest-review/', autoReply: true,
    workflow: {
      id: 'travelokaReviewMonitor1', name: 'Traveloka Review Monitor', file: 'traveloka-reviews.json', cron: '30 10 * * *',
      businesses: '/traveloka/businesses', reviews: '/traveloka/reviews', perRun: 5, perRunNote: '5 new reviews per property, newest first',
    },
  },
  agoda: {
    name: 'Agoda', logo: '/logos/agoda.svg', color: '#b4235a', tint: '#fbe7ef',
    login: 'npm run login -- agoda', ownerUrl: 'https://portal.agoda.com/', autoReply: true,
    workflow: {
      id: 'agodaReviewMonitor1', name: 'Agoda Review Monitor', file: 'agoda-reviews.json', cron: '0 10 * * *',
      businesses: '/agoda/businesses', reviews: '/agoda/reviews', perRun: 5, perRunNote: 'NEW (not yet stored) reviews taken per property per run, newest first; raise it once for a backfill',
    },
  },
  expedia: {
    name: 'Expedia', logo: '/logos/expedia.svg', color: '#1a3d8f', tint: '#e5ebf8',
    login: 'npm run login -- expedia', ownerUrl: 'https://apps.expediapartnercentral.com/manageproperty/ManageProperty', autoReply: false, // read-only for now: approved replies are copied and posted by hand
    noGuestName: true,
    replyNote: 'Expedia does not allow the name of the guest or any personal details in a reply. Never greet the guest by name and never use the reviewer name: start with "Dear valued guest," (Vietnamese "Kính gửi quý khách,") and ignore the greeting rule that asks for the guest name.',
    workflow: {
      id: 'expediaReviewMonitor1', name: 'Expedia Review Monitor', file: 'expedia-reviews.json', cron: '30 11 * * *',
      businesses: '/expedia/businesses', reviews: '/expedia/reviews', perRun: 5, perRunNote: 'NEW (not yet stored) reviews taken per property per run, newest first; raise it once for a backfill',
    },
  },
};
