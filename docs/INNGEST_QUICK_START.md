# 🚀 Inngest Quick Start - Campaign Sending

## ✅ Already Completed

All code has been implemented! Here's what was added:

- ✅ `lib/inngest.ts` - Inngest client
- ✅ `inngest/send-campaign.ts` - Background function (no timeouts!)
- ✅ `app/api/inngest/route.ts` - Inngest API endpoint
- ✅ `app/api/campaigns/[id]/send-inngest/route.ts` - Campaign trigger

## 📋 Your Next Steps (5 minutes)

### 1️⃣ Get Inngest Keys (2 minutes)

Go to: https://app.inngest.com

- Navigate to **Settings** → **Keys**
- Copy **Event Key** (starts with `inngest_event_key_`)
- Copy **Signing Key** (starts with `signkey-prod-`)

### 2️⃣ Add to Environment (1 minute)

Add to your `.env.local`:

```bash
INNGEST_EVENT_KEY=inngest_event_key_YOUR_KEY
INNGEST_SIGNING_KEY=signkey-prod-YOUR_KEY
```

### 3️⃣ Test Locally (Optional - 2 minutes)

```bash
# Terminal 1
npx inngest-cli@latest dev

# Terminal 2
bun dev
```

Visit http://localhost:8288 to see Inngest Dev Server

### 4️⃣ Deploy (1 minute)

```bash
git add .
git commit -m "Add Inngest background jobs"
git push
```

### 5️⃣ Sync with Inngest (1 minute)

After Vercel deploys:

1. Go to [Inngest Dashboard](https://app.inngest.com)
2. Click **Apps** → **Sync App**
3. Enter: `https://your-domain.vercel.app/api/inngest`
4. Click **Sync**

Done! ✨

## 🎯 How to Trigger a Campaign

### Option A: Update Your UI (Recommended)

Change your campaign send button to call:

```typescript
// Old (cron-based)
await fetch(`/api/campaigns/${campaignId}/send`, { method: "POST" });

// New (Inngest - no timeouts!)
await fetch(`/api/campaigns/${campaignId}/send-inngest`, { method: "POST" });
```

### Option B: Test via API

```bash
curl -X POST https://your-domain.vercel.app/api/campaigns/YOUR_CAMPAIGN_ID/send-inngest
```

## 🎉 What You Get

✅ **No More Timeouts** - Campaign sends until done (hours if needed)
✅ **No More 60s Limits** - Process all 36K contacts in one run
✅ **Auto Retries** - Handles failures gracefully
✅ **Visual Monitoring** - See real-time progress in Inngest
✅ **Rate Limit Handling** - Automatically backs off and retries
✅ **Simpler Code** - No more complex locking or batching logic

## 📊 Monitor Your Campaigns

View all campaign sends in real-time:

👉 https://app.inngest.com/runs

You'll see:

- Each step of the process
- Progress through batches
- Any errors or retries
- Total execution time
- Detailed logs

## 🆘 Troubleshooting

**Function not showing in Inngest?**
→ Make sure you synced your app URL and redeployed

**Campaign not starting?**
→ Check environment variables are set in Vercel
→ Check Inngest Dashboard → Events tab

**Still having issues?**
→ Check Inngest Dashboard → Logs
→ Check Vercel logs

## 🔄 Migration Path

**Week 1:**

- Set up Inngest (done!)
- Test with one small campaign
- Monitor in Inngest Dashboard

**Week 2:**

- Update UI to use new endpoint
- Run both systems in parallel
- Verify all campaigns complete successfully

**Week 3:**

- Make Inngest the primary system
- Keep old cron as backup
- Monitor for issues

**Week 4:**

- Disable old cron job
- Remove complex timeout/locking code
- Celebrate! 🎉

## 💡 Pro Tips

1. **Test with small campaign first** - Send to 100 contacts to verify setup
2. **Monitor the first few runs** - Check Inngest Dashboard to see it working
3. **Keep old cron for a week** - As a safety net during transition
4. **Use Inngest Dev Server** - Great for local testing and debugging

## 📚 More Resources

- Inngest Docs: https://www.inngest.com/docs
- Inngest Discord: https://www.inngest.com/discord
- Detailed setup: See `INNGEST_SETUP.md`

---

**Questions?** Check the Inngest Dashboard or logs - everything is visible there!
