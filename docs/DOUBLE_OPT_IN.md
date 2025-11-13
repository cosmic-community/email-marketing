# Double Opt-In Email Verification

## Overview

This system implements **double opt-in** (email verification) for public subscriptions to prevent unauthorized signups and comply with email marketing best practices.

## Problem Solved

Previously, anyone could sign up any email address to your mailing list without verification. This led to:
- Complaints from people who were signed up without consent
- Potential spam/abuse issues
- Non-compliance with email marketing regulations (GDPR, CAN-SPAM)

## How It Works

### 1. Initial Subscription
When someone submits the subscription form:
- Contact is created with **"Pending"** status (not "Active")
- A secure verification token is generated (32-byte random hex string)
- Token expires in 24 hours
- Verification email is sent with a unique link

### 2. Email Verification
When the user clicks the verification link:
- System validates the token and checks expiration
- Contact status is updated from "Pending" to "Active"
- Verification token is cleared
- Welcome email is sent
- User is redirected to success page

### 3. Campaign Sending
Only contacts with **"Active"** status receive campaigns. "Pending" contacts are excluded until they verify their email.

## Technical Implementation

### Files Modified

1. **types.ts**
   - Added "Pending" status to EmailContact
   - Added verification_token, verification_token_expires, verified_at fields
   - Updated CreateContactData interface

2. **lib/cosmic.ts**
   - Updated createEmailContact to handle verification fields

3. **app/api/subscribe/route.ts**
   - Changed default status from "Active" to "Pending"
   - Added token generation using crypto
   - Updated email content to send verification link instead of welcome message

4. **components/SubscriptionForm.tsx**
   - Updated success message to emphasize email verification requirement
   - Added helpful instructions for users

### Files Created

1. **app/api/subscribe/verify/route.ts**
   - Handles verification link clicks
   - Validates token and expiration
   - Updates contact status to Active
   - Sends welcome email
   - Handles error cases (expired, invalid, already verified)

2. **app/subscribe/verified/page.tsx**
   - Success page shown after successful verification
   - Displays confirmation and next steps

3. **app/subscribe/page.tsx** (enhanced)
   - Added error handling for verification failures
   - Shows user-friendly error messages

## Security Features

The implementation includes multiple layers of security:

1. **Token-based verification**: Cryptographically secure random tokens
2. **Time-limited**: Tokens expire after 24 hours
3. **One-time use**: Token is cleared after successful verification
4. **Bot protection**: Existing bot protection (honeypot, rate limiting) still applies
5. **Email ownership proof**: Only someone with access to the email can activate the subscription

## User Experience

### For Legitimate Users
1. Fill out subscription form
2. See message: "Check your email"
3. Open verification email
4. Click verification button
5. See success page and receive welcome email

### For Malicious Signups
- Victim receives ONE verification email
- If they don't click the link, they're never added to the active list
- Token expires in 24 hours
- No further emails are sent unless they verify

## Email Flow

### Before Verification
```
User submits form → Verification Email (with link)
                 → Internal notification (status: Pending)
```

### After Verification
```
User clicks link → Status updated to Active
                → Welcome Email sent
                → User can now receive campaigns
```

## Configuration

No additional configuration needed. The system uses:
- `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_SITE_URL` for verification link base URL
- Existing email settings from Cosmic CMS
- Node.js built-in `crypto` module for token generation

## Testing

To test the implementation:

1. **Normal flow**:
   - Submit subscription form
   - Check for verification email
   - Click verification link
   - Verify contact is now "Active" in database

2. **Token expiration**:
   - Manually modify token expiration date in database
   - Try to verify
   - Should see "expired" error

3. **Already verified**:
   - Try clicking verification link again
   - Should see "already verified" message

4. **Invalid token**:
   - Modify token in verification URL
   - Should see "invalid token" error

## Compliance

This implementation helps comply with:
- **GDPR**: Requires explicit consent before sending marketing emails
- **CAN-SPAM Act**: Ensures recipients actually requested to be on the list
- **Email Service Provider Requirements**: Most ESPs require or strongly recommend double opt-in

## Migration Notes

### Existing Contacts
Existing contacts in the database are unaffected. They maintain their current status (Active, Unsubscribed, etc.).

### New Contacts via Other Methods
- Contacts added manually through the admin interface: Can be set to "Active" immediately
- Contacts from CSV upload: Can be set to "Active" immediately (assumes permission already obtained)
- **Only public subscription form uses double opt-in**

## Monitoring

Admin notifications now include:
- Verification status (Pending)
- Token expiration time
- Bot protection score

Monitor for:
- High verification rates (good - means legitimate users)
- Low verification rates (may indicate issues with email delivery)
- Expired tokens (users may need reminder emails - future enhancement)

## Future Enhancements

Potential improvements:
1. Resend verification email functionality
2. Automated reminder if not verified within X hours
3. Dashboard metrics for verification rates
4. Bulk cleanup of expired pending subscriptions
5. Custom verification email templates

## Support

If users report not receiving verification emails, check:
1. Spam/junk folders
2. Email server logs in Resend dashboard
3. Correct email address entered
4. Token hasn't expired (24 hour window)

