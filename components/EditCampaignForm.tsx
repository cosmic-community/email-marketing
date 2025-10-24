"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  MarketingCampaign,
  EmailTemplate,
  EmailContact,
  EmailList,
} from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar,
  Users,
  Tag,
  Mail,
  Settings2,
  Share,
  ExternalLink,
  Search,
  X,
} from "lucide-react";

interface EditCampaignFormProps {
  campaign: MarketingCampaign;
  templates: EmailTemplate[];
  contacts: EmailContact[];
  lists: EmailList[];
  onFormDataChange: (
    formData: any,
    isLoading: boolean,
    handleSubmit: () => Promise<void>
  ) => void;
}

export default function EditCampaignForm({
  campaign,
  templates,
  contacts,
  lists,
  onFormDataChange,
}: EditCampaignFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Contact search state
  const [contactSearchTerm, setContactSearchTerm] = useState("");
  const [searchedContacts, setSearchedContacts] = useState<EmailContact[]>([]);
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);

  // Tag search state
  const [tagSearchTerm, setTagSearchTerm] = useState("");
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: campaign.metadata.name || "",
    target_type: "lists" as "lists" | "contacts" | "tags",
    list_ids: [] as string[],
    contact_ids: [] as string[],
    target_tags: [] as string[],
    send_date: campaign.metadata.send_date || "",
    schedule_type: "now" as "now" | "scheduled",
    public_sharing_enabled: campaign.metadata.public_sharing_enabled ?? false,
  });

  const canEdit = campaign.metadata?.status?.value === "Draft";
  const status = campaign.metadata?.status?.value || "Draft";

  // Search contacts with debouncing
  const searchContacts = useCallback(async (term: string) => {
    if (term.length < 2) {
      setSearchedContacts([]);
      return;
    }

    setIsSearchingContacts(true);
    try {
      const response = await fetch(
        `/api/contacts?search=${encodeURIComponent(term)}&limit=20`
      );
      const data = await response.json();

      if (data.success) {
        setSearchedContacts(data.data.contacts);
      }
    } catch (error) {
      console.error("Error searching contacts:", JSON.stringify(error));
    } finally {
      setIsSearchingContacts(false);
    }
  }, []);

  // Debounce contact search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (contactSearchTerm) {
        searchContacts(contactSearchTerm);
      } else {
        setSearchedContacts([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [contactSearchTerm, searchContacts]);

  // Search for available tags
  const searchTags = useCallback(async (term: string) => {
    if (term.length < 2) {
      setAvailableTags([]);
      return;
    }

    try {
      const response = await fetch(
        `/api/contacts/tags?search=${encodeURIComponent(term)}`
      );
      const data = await response.json();

      if (data.success) {
        setAvailableTags(data.tags);
      }
    } catch (error) {
      console.error("Error searching tags:", JSON.stringify(error));
    }
  }, []);

  // Debounce tag search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (tagSearchTerm) {
        searchTags(tagSearchTerm);
      } else {
        setAvailableTags([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [tagSearchTerm, searchTags]);

  // Get selected contacts details from the contacts prop (already populated with depth=1)
  const selectedContactsDetails = contacts.filter((contact) =>
    formData.contact_ids.includes(contact.id)
  );

  // Initialize form data from campaign
  useEffect(() => {
    const initializeFormData = () => {
      const targetLists = campaign.metadata.target_lists || [];
      const targetContacts = campaign.metadata.target_contacts || [];
      const targetTags = campaign.metadata.target_tags || [];

      let targetType: "lists" | "contacts" | "tags" = "lists";

      // Determine the primary target type based on what has data
      if (targetContacts.length > 0) {
        targetType = "contacts";
      } else if (targetTags.length > 0) {
        targetType = "tags";
      } else {
        targetType = "lists";
      }

      // Extract list IDs - handle both string IDs and objects with id property
      const listIds = targetLists.map((list) =>
        typeof list === "string" ? list : list.id
      );

      // Extract contact IDs - handle both string IDs and objects with id property
      const contactIds = targetContacts.map((contact) =>
        typeof contact === "string" ? contact : contact.id
      );

      // Convert ISO datetime to datetime-local format for display
      let displaySendDate = "";
      if (campaign.metadata.send_date) {
        const date = new Date(campaign.metadata.send_date);
        // Format as "YYYY-MM-DDTHH:mm" in local time
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        displaySendDate = `${year}-${month}-${day}T${hours}:${minutes}`;
      }

      setFormData({
        name: campaign.metadata.name || "",
        target_type: targetType,
        list_ids: listIds,
        contact_ids: contactIds,
        target_tags: targetTags,
        send_date: displaySendDate,
        schedule_type: campaign.metadata.send_date ? "scheduled" : "now",
        public_sharing_enabled:
          campaign.metadata.public_sharing_enabled ?? false,
      });
    };

    initializeFormData();
  }, [campaign]);

  // Update parent component whenever form data or loading state changes
  useEffect(() => {
    onFormDataChange(formData, isLoading, handleSubmit);
  }, [formData, isLoading]);

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Campaign name is required",
        variant: "destructive",
      });
      return;
    }

    // Validate targets
    const hasLists =
      formData.target_type === "lists" && formData.list_ids.length > 0;
    const hasContacts =
      formData.target_type === "contacts" && formData.contact_ids.length > 0;
    const hasTags =
      formData.target_type === "tags" && formData.target_tags.length > 0;

    if (!hasLists && !hasContacts && !hasTags) {
      toast({
        title: "Error",
        description: "Please select at least one target audience",
        variant: "destructive",
      });
      return;
    }

    // Validate schedule
    if (formData.schedule_type === "scheduled" && !formData.send_date) {
      toast({
        title: "Error",
        description: "Please select a send date for scheduled campaigns",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const updateData: any = {
        name: formData.name,
        public_sharing_enabled: formData.public_sharing_enabled,
      };

      // Set targets based on type
      if (formData.target_type === "lists") {
        updateData.list_ids = formData.list_ids;
        updateData.contact_ids = [];
        updateData.target_tags = [];
      } else if (formData.target_type === "contacts") {
        updateData.list_ids = [];
        updateData.contact_ids = formData.contact_ids;
        updateData.target_tags = [];
      } else if (formData.target_type === "tags") {
        updateData.list_ids = [];
        updateData.contact_ids = [];
        updateData.target_tags = formData.target_tags;
      }

      // Set send date - convert datetime-local string to ISO string with timezone
      if (formData.schedule_type === "scheduled" && formData.send_date) {
        // datetime-local gives us "YYYY-MM-DDTHH:mm" in local time
        // We need to convert this to an ISO string that preserves the timezone
        const localDateTime = new Date(formData.send_date);
        updateData.send_date = localDateTime.toISOString();
      } else {
        updateData.send_date = "";
      }

      // Automatically set status based on schedule type
      // If scheduled for future, set status to "Scheduled", otherwise keep as "Draft"
      if (formData.schedule_type === "scheduled" && updateData.send_date) {
        const scheduledTime = new Date(updateData.send_date);
        const now = new Date();
        if (scheduledTime > now) {
          updateData.status = "Scheduled";
        } else {
          // If scheduled time is in the past, keep as Draft
          updateData.status = "Draft";
        }
      } else {
        // No schedule or immediate send - keep as Draft
        updateData.status = "Draft";
      }

      const response = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update campaign");
      }

      // Show appropriate success message based on status
      const successMessage =
        updateData.status === "Scheduled"
          ? "Campaign scheduled successfully"
          : "Campaign updated successfully";

      toast({
        title: "Success",
        description: successMessage,
        variant: "default",
      });

      router.refresh();
    } catch (error: any) {
      console.error("Campaign update error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update campaign",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleListSelect = (listId: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      list_ids: checked
        ? [...prev.list_ids, listId]
        : prev.list_ids.filter((id) => id !== listId),
    }));
  };

  const handleContactSelect = (contactId: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      contact_ids: checked
        ? [...prev.contact_ids, contactId]
        : prev.contact_ids.filter((id) => id !== contactId),
    }));
  };

  const getSelectedCount = () => {
    if (formData.target_type === "lists") {
      return formData.list_ids.length;
    } else if (formData.target_type === "contacts") {
      return formData.contact_ids.length;
    } else if (formData.target_type === "tags") {
      return formData.target_tags.length;
    }
    return 0;
  };

  const publicUrl = `${
    typeof window !== "undefined" ? window.location.origin : ""
  }/public/campaigns/${campaign.id}`;

  // Function to truncate URL for display
  const getTruncatedUrl = (url: string, maxLength: number = 50) => {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + "...";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Settings2 className="h-5 w-5" />
          <span>Campaign Settings</span>
          <Badge
            variant="outline"
            className={
              status === "Draft"
                ? "bg-gray-100 text-gray-800"
                : "bg-blue-100 text-blue-800"
            }
          >
            {status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Campaign Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Campaign Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="Enter campaign name"
            disabled={!canEdit}
          />
        </div>

        {/* Public Sharing */}
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Share className="h-4 w-4 text-gray-500" />
              <Label htmlFor="public-sharing" className="text-sm font-medium">
                Enable Public Sharing
              </Label>
            </div>
            <Switch
              id="public-sharing"
              checked={formData.public_sharing_enabled}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({
                  ...prev,
                  public_sharing_enabled: checked,
                }))
              }
              disabled={!canEdit}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              When enabled, this campaign can be viewed publicly via a shareable
              link, and "View in Browser" links will be included in emails.
            </p>

            {formData.public_sharing_enabled && (
              <div className="flex items-center space-x-2 p-2 bg-white rounded border">
                <ExternalLink className="h-4 w-4 text-blue-500" />
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 font-mono hover:text-blue-800 hover:underline flex-1 truncate"
                  title={publicUrl}
                >
                  {getTruncatedUrl(publicUrl)}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Target Audience */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Target Audience</Label>

          {/* Target Type Selection */}
          <Select
            value={formData.target_type}
            onValueChange={(value: "lists" | "contacts" | "tags") =>
              setFormData((prev) => ({ ...prev, target_type: value }))
            }
            disabled={!canEdit}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select target type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lists">
                <div className="flex items-center space-x-2">
                  <Users className="h-4 w-4" />
                  <span>Email Lists</span>
                </div>
              </SelectItem>
              <SelectItem value="contacts">
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4" />
                  <span>Individual Contacts</span>
                </div>
              </SelectItem>
              <SelectItem value="tags">
                <div className="flex items-center space-x-2">
                  <Tag className="h-4 w-4" />
                  <span>Contact Tags</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Lists Selection */}
          {formData.target_type === "lists" && (
            <div className="space-y-3 p-4 border rounded-lg bg-gray-50">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Select Email Lists
                </Label>
                <span className="text-sm text-gray-500">
                  {formData.list_ids.length} selected
                </span>
              </div>

              {lists.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  No email lists available. Create a list first.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {lists.map((list) => (
                    <div
                      key={list.id}
                      className="flex items-center space-x-3 p-2 bg-white rounded border"
                    >
                      <Checkbox
                        id={`list-${list.id}`}
                        checked={formData.list_ids.includes(list.id)}
                        onCheckedChange={(checked) =>
                          handleListSelect(list.id, checked as boolean)
                        }
                        disabled={!canEdit}
                      />
                      <label
                        htmlFor={`list-${list.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="font-medium">{list.metadata.name}</div>
                        <div className="text-sm text-gray-500">
                          {list.metadata.total_contacts || 0} contacts
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Contacts Search Selection */}
          {formData.target_type === "contacts" && (
            <div className="space-y-3 p-4 border rounded-lg bg-gray-50">
              {/* Selected Contacts List */}
              {formData.contact_ids.length > 0 && (
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      Selected Contacts
                    </Label>
                    <span className="text-sm text-gray-500">
                      {formData.contact_ids.length} selected
                    </span>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selectedContactsDetails.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center justify-between p-3 bg-white rounded border"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-sm">
                            {contact.metadata.first_name}{" "}
                            {contact.metadata.last_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {contact.metadata.email}
                          </div>
                        </div>
                        {canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleContactSelect(contact.id, false)
                            }
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search to Add More Contacts */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    {formData.contact_ids.length > 0
                      ? "Add More Contacts"
                      : "Search & Select Contacts"}
                  </Label>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    value={contactSearchTerm}
                    onChange={(e) => setContactSearchTerm(e.target.value)}
                    placeholder="Search contacts by name or email..."
                    className="pl-10"
                    disabled={!canEdit}
                  />
                  {isSearchingContacts && (
                    <div className="absolute right-3 top-3">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                {/* Search Results */}
                {searchedContacts.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {searchedContacts
                      .filter(
                        (contact) => contact.metadata.status.value === "Active"
                      )
                      .map((contact) => (
                        <div
                          key={contact.id}
                          className="flex items-center space-x-3 p-2 bg-white rounded border"
                        >
                          <Checkbox
                            id={`contact-${contact.id}`}
                            checked={formData.contact_ids.includes(contact.id)}
                            onCheckedChange={(checked) =>
                              handleContactSelect(
                                contact.id,
                                checked as boolean
                              )
                            }
                            disabled={!canEdit}
                          />
                          <label
                            htmlFor={`contact-${contact.id}`}
                            className="flex-1 cursor-pointer"
                          >
                            <div className="font-medium">
                              {contact.metadata.first_name}{" "}
                              {contact.metadata.last_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {contact.metadata.email}
                            </div>
                          </label>
                        </div>
                      ))}
                  </div>
                )}

                {contactSearchTerm &&
                  contactSearchTerm.length >= 2 &&
                  !isSearchingContacts &&
                  searchedContacts.length === 0 && (
                    <p className="text-sm text-gray-500 py-4 text-center">
                      No contacts found for "{contactSearchTerm}"
                    </p>
                  )}

                {!contactSearchTerm && formData.contact_ids.length === 0 && (
                  <p className="text-sm text-gray-500 py-4 text-center">
                    Type to search for contacts to add
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tags Selection */}
          {formData.target_type === "tags" && (
            <div className="space-y-3 p-4 border rounded-lg bg-gray-50">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Search & Select Tags
                </Label>
                <span className="text-sm text-gray-500">
                  {formData.target_tags.length} selected
                </span>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  value={tagSearchTerm}
                  onChange={(e) => setTagSearchTerm(e.target.value)}
                  placeholder="Search tags..."
                  className="pl-10"
                  disabled={!canEdit}
                />
              </div>

              {/* Available Tags */}
              {availableTags.length > 0 && (
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {availableTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        if (!formData.target_tags.includes(tag)) {
                          setFormData((prev) => ({
                            ...prev,
                            target_tags: [...prev.target_tags, tag],
                          }));
                          setTagSearchTerm("");
                          setAvailableTags([]);
                        }
                      }}
                      disabled={!canEdit || formData.target_tags.includes(tag)}
                      className="w-full text-left px-3 py-2 text-sm bg-white border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}

              {/* Selected Tags */}
              {formData.target_tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.target_tags.map((tag) => (
                    <div
                      key={tag}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                    >
                      <Tag className="h-3 w-3" />
                      <span>{tag}</span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            setFormData((prev) => ({
                              ...prev,
                              target_tags: prev.target_tags.filter(
                                (t) => t !== tag
                              ),
                            }));
                          }}
                          className="ml-1 hover:text-blue-900"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <p className="text-sm text-gray-500">
                Campaign will be sent to contacts that have any of these tags
              </p>
            </div>
          )}
        </div>

        {/* Schedule Settings */}
        <div className="space-y-4">
          <Label className="text-base font-medium flex items-center space-x-2">
            <Calendar className="h-4 w-4" />
            <span>Schedule Settings</span>
          </Label>

          <Select
            value={formData.schedule_type}
            onValueChange={(value: "now" | "scheduled") =>
              setFormData((prev) => ({ ...prev, schedule_type: value }))
            }
            disabled={!canEdit}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="now">
                Send immediately when triggered
              </SelectItem>
              <SelectItem value="scheduled">Schedule for later</SelectItem>
            </SelectContent>
          </Select>

          {formData.schedule_type === "scheduled" && (
            <div className="space-y-2">
              <Label htmlFor="send-date">
                Send Date & Time (Your Local Time)
              </Label>
              <Input
                id="send-date"
                type="datetime-local"
                value={formData.send_date}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    send_date: e.target.value,
                  }))
                }
                disabled={!canEdit}
              />
              <p className="text-xs text-gray-500">
                Your timezone:{" "}
                {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </p>
            </div>
          )}
        </div>

        {/* Target Summary */}
        {getSelectedCount() > 0 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm font-medium text-blue-800">
              Campaign Target Summary:
            </div>
            <div className="text-sm text-blue-600 mt-1">
              {getSelectedCount()} {formData.target_type} selected
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
