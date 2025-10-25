# Email Marketing Documentation

## 📚 Documentation Index

### Getting Started with Inngest

**Start here:** [INNGEST_QUICK_START.md](./INNGEST_QUICK_START.md)
- 5-minute setup guide
- How to get Inngest keys
- Deployment steps
- Quick verification

### Complete Migration Guide

**For comprehensive details:** [INNGEST_MIGRATION_COMPLETE.md](./INNGEST_MIGRATION_COMPLETE.md)
- What was changed in the migration
- How the system works now
- Complete deployment checklist
- Troubleshooting guide
- System architecture diagrams

### Performance Optimizations

**Technical deep-dive:** [CAMPAIGN_OPTIMIZATIONS.md](./CAMPAIGN_OPTIMIZATIONS.md)
- Database query optimizations (4-6x speedup)
- Duplicate prevention system
- Batch processing improvements
- Timeout handling strategies

---

## 🚀 Quick Reference

### Environment Variables Required

```bash
# Inngest (NEW)
INNGEST_EVENT_KEY=inngest_event_key_YOUR_KEY
INNGEST_SIGNING_KEY=signkey-prod-YOUR_KEY

# Cosmic CMS (existing)
COSMIC_BUCKET_SLUG=your-bucket-slug
COSMIC_READ_KEY=your-read-key
COSMIC_WRITE_KEY=your-write-key

# Resend Email (existing)
RESEND_API_KEY=re_your_key

# App URLs (existing)
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
```

### Key Files Changed

- `components/SendCampaignButton.tsx` - Uses Inngest endpoint
- `app/api/campaigns/[id]/send-inngest/route.ts` - Triggers Inngest
- `inngest/send-campaign.ts` - Main background function
- `inngest/check-scheduled.ts` - Scheduled campaign checker
- `app/api/cron/check-scheduled-campaigns/route.ts` - Simplified cron
- `vercel.json` - Updated cron path

---

## 📖 Additional Documentation

### In Scripts Folder

- `scripts/README-organize-contacts.md` - Contact organization utilities

### Main README

- See [../README.md](../README.md) for project overview

---

## 🆘 Need Help?

1. **Setup issues?** → See [INNGEST_QUICK_START.md](./INNGEST_QUICK_START.md)
2. **How does it work?** → See [INNGEST_MIGRATION_COMPLETE.md](./INNGEST_MIGRATION_COMPLETE.md)
3. **Performance questions?** → See [CAMPAIGN_OPTIMIZATIONS.md](./CAMPAIGN_OPTIMIZATIONS.md)
4. **Inngest Dashboard:** https://app.inngest.com
5. **Inngest Docs:** https://www.inngest.com/docs

