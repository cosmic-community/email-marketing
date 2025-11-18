// Re-export everything from the modularized cosmic files
// This barrel file maintains backward compatibility with existing imports

// Client
export { cosmic } from "./client";

// Utils
export { hasStatus, withTimeout } from "./utils";

// Campaign Sends Tracking
export {
  reserveContactsForSending,
  createCampaignSend,
  hasContactBeenSent,
  getSentContactIds,
  getCampaignSendStats,
  filterUnsentContacts,
  getCampaignTrackingStats,
  syncCampaignTrackingStats,
} from "./campaign-sends";

// Upload Jobs
export {
  getUploadJobs,
  getUploadJob,
  createUploadJob,
  updateUploadJobProgress,
  deleteUploadJob,
} from "./upload-jobs";

// Media
export {
  getMedia,
  getSingleMedia,
  uploadMedia,
  updateMedia,
  deleteMedia,
  getMediaFolders,
  searchMedia,
  getMediaStats,
} from "./media";

// Lists
export {
  getEmailLists,
  getEmailList,
  createEmailList,
  updateEmailList,
  deleteEmailList,
  getListContactCountEfficient,
  getMultipleListContactCounts,
  getListContactCount,
  updateListContactCount,
} from "./lists";

// Contacts
export {
  checkEmailsExist,
  getEmailContacts,
  getUnsubscribedContactsByCampaign,
  getClickStatsByCampaign,
  getClickEventsByCampaign,
  getEmailContact,
  createEmailContact,
  updateEmailContact,
  deleteEmailContact,
  bulkUpdateContactLists,
  getContactsByListId,
  getContactsByListIdPaginated,
  unsubscribeContact,
  getContactsByListIdSafe,
} from "./contacts";

// Templates
export {
  getEmailTemplates,
  getEmailTemplate,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  duplicateEmailTemplate,
} from "./templates";

// Campaigns
export {
  getMarketingCampaigns,
  getEmailCampaigns,
  getMarketingCampaign,
  getEmailCampaign,
  createMarketingCampaign,
  updateCampaignStatus,
  updateCampaignProgress,
  updateMarketingCampaign,
  updateEmailCampaign,
  deleteMarketingCampaign,
  deleteEmailCampaign,
  getCampaignTargetContacts,
  getCampaignTargetCount,
} from "./campaigns";

// Settings
export {
  getSettings,
  updateSettings,
  createOrUpdateSettings,
} from "./settings";

