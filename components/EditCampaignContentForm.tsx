"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarketingCampaign, TemplateType } from "@/types";
import {
  AlertCircle,
  CheckCircle,
  Info,
  FileText,
  Image,
  File,
  Plus,
  Globe,
  Wand2,
  Maximize,
  Minimize,
  Save,
  Edit,
  X,
  BookTemplate,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ContentEditor from "./shared/ContentEditor";
import { useToast } from "@/hooks/use-toast";
import { useTemplateSettings } from "@/hooks/useTemplateSettings";

interface ContextItem {
  id: string;
  url: string;
  type: "file" | "webpage";
  status: "pending" | "analyzing" | "ready" | "error";
  title?: string;
  error?: string;
}

interface EditCampaignContentFormProps {
  campaign: MarketingCampaign;
}

interface CreateTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (templateData: {
    name: string;
    template_type: TemplateType;
    active: boolean;
  }) => void;
  defaultSubject: string;
}

function CreateTemplateDialog({
  isOpen,
  onClose,
  onSave,
  defaultSubject,
}: CreateTemplateDialogProps) {
  const [templateData, setTemplateData] = useState({
    name: `${defaultSubject} Template`,
    template_type: "Newsletter" as TemplateType,
    active: true,
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTemplateData({
        name: `${defaultSubject} Template`,
        template_type: "Newsletter" as TemplateType,
        active: true,
      });
    }
  }, [isOpen, defaultSubject]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateData.name.trim()) return;
    onSave(templateData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <BookTemplate className="h-5 w-5 text-blue-600" />
            <span>Create Template from Campaign</span>
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name *</Label>
            <Input
              id="template-name"
              value={templateData.name}
              onChange={(e) =>
                setTemplateData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Enter template name"
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Template Type</Label>
            <Select
              value={templateData.template_type}
              onValueChange={(value: TemplateType) =>
                setTemplateData((prev) => ({ ...prev, template_type: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Newsletter">Newsletter</SelectItem>
                <SelectItem value="Welcome Email">Welcome Email</SelectItem>
                <SelectItem value="Promotional">Promotional</SelectItem>
                <SelectItem value="Transactional">Transactional</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="template-active" className="text-sm font-medium">
                Active Template
              </Label>
              <p className="text-xs text-gray-600">
                Make this template available for creating campaigns
              </p>
            </div>
            <input
              id="template-active"
              type="checkbox"
              checked={templateData.active}
              onChange={(e) =>
                setTemplateData((prev) => ({ ...prev, active: e.target.checked }))
              }
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-between pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!templateData.name.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <BookTemplate className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function EditCampaignContentForm({
  campaign,
}: EditCampaignContentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isAIEditing, setIsAIEditing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [aiProgress, setAiProgress] = useState(0);
  const [editingSessionActive, setEditingSessionActive] = useState(false);
  const { toast } = useToast();

  // Create Template Dialog state
  const [showCreateTemplateDialog, setShowCreateTemplateDialog] = useState(false);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);

  // Full screen state
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Use shared settings hook
  const { settings, primaryColor } = useTemplateSettings();

  // Context items state for AI editing
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [showContextInput, setShowContextInput] = useState(false);
  const [contextUrl, setContextUrl] = useState("");

  // AI Subject generation state
  const [isGeneratingSubject, setIsGeneratingSubject] = useState(false);

  // Refs for autofocus and auto-resize
  const aiPromptRef = useRef<HTMLTextAreaElement>(null);

  // CRITICAL: Separate display state from editing state
  // Display state - what's shown in read-only view (NEVER changes during editing)
  const [displayData, setDisplayData] = useState({
    subject:
      campaign.metadata.campaign_content?.subject ||
      campaign.metadata.subject ||
      "",
    content:
      campaign.metadata.campaign_content?.content ||
      campaign.metadata.content ||
      "",
    template_type:
      (campaign.metadata.campaign_content?.template_type
        ?.value as TemplateType) || "Newsletter",
  });

  // Form state - ONLY used during editing sessions
  const [formData, setFormData] = useState({
    subject:
      campaign.metadata.campaign_content?.subject ||
      campaign.metadata.subject ||
      "",
    content:
      campaign.metadata.campaign_content?.content ||
      campaign.metadata.content ||
      "",
    template_type:
      (campaign.metadata.campaign_content?.template_type
        ?.value as TemplateType) || "Newsletter",
  });

  // Store original campaign data for reset functionality and change tracking
  const [originalFormData, setOriginalFormData] = useState({
    subject:
      campaign.metadata.campaign_content?.subject ||
      campaign.metadata.subject ||
      "",
    content:
      campaign.metadata.campaign_content?.content ||
      campaign.metadata.content ||
      "",
    template_type:
      (campaign.metadata.campaign_content?.template_type
        ?.value as TemplateType) || "Newsletter",
  });

  // Track if form has unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if form has changes
  const hasFormChanges = () => {
    return (
      formData.subject !== originalFormData.subject ||
      formData.content !== originalFormData.content ||
      formData.template_type !== originalFormData.template_type
    );
  };

  // Update unsaved changes state whenever form data changes
  useEffect(() => {
    setHasUnsavedChanges(hasFormChanges() && !isSubmitting);
  }, [formData, isSubmitting]);

  // CRITICAL: Handle content change from shared editor with proper state sync
  const handleContentChange = (content: string) => {
    // Immediately update form data to ensure content is saved
    setFormData((prev) => ({ ...prev, content }));
  };

  // Handle AI Subject Generation
  const handleGenerateSubject = async () => {
    if (!formData.content.trim()) {
      setError("Please add some content first before generating a subject");
      toast({
        title: "Content Required",
        description: "Add email content before generating a subject line",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingSubject(true);
    setError("");

    try {
      const response = await fetch("/api/campaigns/generate-subject", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: formData.content,
          templateType: formData.template_type,
          context_items: contextItems.filter(
            (item) => item.status === "ready" || item.status === "pending"
          ),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate subject");
      }

      const result = await response.json();

      if (result.success && result.subject) {
        setFormData((prev) => ({
          ...prev,
          subject: result.subject,
        }));

        toast({
          title: "Subject Generated!",
          description: result.fallback
            ? "Generated fallback subject line"
            : "AI-generated subject line ready to use",
          variant: "success",
        });
      }
    } catch (error) {
      console.error("Subject generation error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to generate subject";
      setError(errorMessage);
      toast({
        title: "Generation Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSubject(false);
    }
  };

  // Handle Create Template
  const handleCreateTemplate = async (templateData: {
    name: string;
    template_type: TemplateType;
    active: boolean;
  }) => {
    setIsCreatingTemplate(true);
    setError("");

    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/create-template`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: templateData.name,
          template_type: templateData.template_type,
          active: templateData.active,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create template");
      }

      const result = await response.json();

      toast({
        title: "Template Created!",
        description: `"${templateData.name}" has been saved as a template`,
        variant: "success",
      });

      setShowCreateTemplateDialog(false);

      // Optionally navigate to templates page
      setTimeout(() => {
        router.push(`/templates/${result.template.id}/edit`);
      }, 1000);

    } catch (error) {
      console.error("Template creation error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create template";
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsCreatingTemplate(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.subject.trim()) {
      setError("Subject line is required");
      toast({
        title: "Validation Error",
        description: "Please enter a subject line",
        variant: "destructive",
      });
      return;
    }

    if (!formData.content.trim()) {
      setError("Content is required");
      toast({
        title: "Validation Error",
        description: "Please enter email content",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/campaigns/${campaign.id}/content`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject: formData.subject,
            content: formData.content,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || "Failed to update campaign content"
          );
        }

        const result = await response.json();

        // CRITICAL: Store saved data but DON'T update display data yet
        const savedData = {
          subject: formData.subject,
          content: formData.content,
          template_type: formData.template_type,
        };

        // Update what's considered "saved" for change tracking
        setOriginalFormData(savedData);

        setSuccess("Campaign content updated successfully!");
        
        // ENHANCED: Show highly visible success toast
        toast({
          title: "Success!",
          description: "🎉 Campaign content saved successfully!",
          variant: "success",
        });

        // CRITICAL: End the editing session which will update display data
        endEditingSession(savedData);

        // Refresh the page to get updated data
        router.refresh();
      } catch (error) {
        console.error("Campaign content update error:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to update campaign content";
        setError(errorMessage);
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  // Start editing session - CRITICAL: Don't change display data
  const startEditingSession = () => {
    setEditingSessionActive(true);
    setIsFullScreen(true); // Open directly in full screen
    setError("");
    setSuccess("");
    
    // CRITICAL: Initialize form data with current display data (not campaign metadata)
    // This ensures we start editing with what's currently displayed
    setFormData({
      subject: displayData.subject,
      content: displayData.content,
      template_type: displayData.template_type,
    });
  };

  // CRITICAL: Enhanced end editing session - only update display data when ending
  const endEditingSession = (savedData?: {
    subject: string;
    content: string;
    template_type: TemplateType;
  }) => {
    setEditingSessionActive(false);
    setIsFullScreen(false); // Exit full screen when ending session
    setIsAIEditing(false);
    setAiPrompt("");
    setStreamingContent("");
    setAiStatus("");
    setAiProgress(0);
    setContextItems([]);
    setShowContextInput(false);
    setContextUrl("");
    
    // CRITICAL: Update display data ONLY when ending the session
    // If savedData is provided (from successful save), use that
    // Otherwise, keep the existing display data unchanged
    if (savedData) {
      setDisplayData(savedData);
    }
    
    // Reset form data to current display data
    const currentDisplayData = savedData || displayData;
    setFormData({
      subject: currentDisplayData.subject,
      content: currentDisplayData.content,
      template_type: currentDisplayData.template_type,
    });
  };

  // FIXED: Close full screen button - now properly ends editing session
  const handleCloseFullScreen = () => {
    // CRITICAL: End the entire editing session, don't just toggle full screen
    // This ensures the fields return to read-only mode
    endEditingSession();
  };

  // Handle AI editing
  const handleAIEdit = async () => {
    if (!aiPrompt.trim()) {
      setError("Please provide instructions for AI editing");
      return;
    }

    setIsAIEditing(true);
    setError("");
    setSuccess("");
    setStreamingContent("");
    setAiStatus("Starting AI editing...");
    setAiProgress(0);

    try {
      const requestBody = {
        campaignId: campaign.id,
        currentContent: formData.content,
        currentSubject: formData.subject,
        prompt: aiPrompt,
        context_items: contextItems.filter(
          (item) => item.status === "ready" || item.status === "pending"
        ),
      };

      const response = await fetch("/api/campaigns/edit-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error("Failed to start AI editing");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === "status") {
                  setAiStatus(data.message);
                  setAiProgress(data.progress || 0);
                } else if (data.type === "content") {
                  accumulatedContent += data.text;
                  setStreamingContent(accumulatedContent);
                  // CRITICAL: Update form data immediately with streaming content
                  setFormData((prev) => ({
                    ...prev,
                    content: accumulatedContent,
                  }));
                } else if (data.type === "complete") {
                  // CRITICAL: Final update with complete content and subject
                  setFormData((prev) => ({
                    ...prev,
                    content: data.data.content,
                    subject: data.data.subject || prev.subject,
                  }));
                  setAiPrompt("");
                  setAiStatus("Editing complete!");
                  setAiProgress(100);
                  toast({
                    title: "AI Editing Complete",
                    description: data.data.subject 
                      ? "Content and subject updated successfully!"
                      : "Content edited successfully! Continue editing or save campaign.",
                    variant: "success",
                  });

                  // Content will be updated via the shared ContentEditor
                } else if (data.type === "error") {
                  throw new Error(data.error);
                }
              } catch (parseError) {
                console.warn("Failed to parse SSE data:", parseError);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error("AI editing error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to edit with AI";
      setError(errorMessage);
      toast({
        title: "AI Editing Failed",
        description: "AI editing failed. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAIEditing(false);
      setAiStatus("");
      setAiProgress(0);
    }
  };

  // Add context item
  const addContextItem = async (url: string) => {
    if (!url.trim()) return;

    // FIXED: Better detection - check for image/media file extensions FIRST
    // This handles URLs like https://imgix.cosmicjs.com/...image.png correctly
    const imageExtensions = /\.(jpg|jpeg|png|gif|bmp|webp|svg|ico|tiff|tif)$/i;
    const documentExtensions = /\.(pdf|doc|docx|txt|csv|xls|xlsx|zip|rar|ppt|pptx)$/i;
    
    // Check if URL has an image extension - this takes priority
    const isImageFile = imageExtensions.test(url.trim());
    // Check if URL has a document extension
    const isDocumentFile = documentExtensions.test(url.trim());
    
    // Determine type: if it has a media/document extension, it's a file
    // Otherwise, treat it as a webpage
    const itemType: "file" | "webpage" = (isImageFile || isDocumentFile) ? "file" : "webpage";
    
    const newItem: ContextItem = {
      id: Date.now().toString(),
      url: url.trim(),
      type: itemType,
      status: "pending",
    };

    setContextItems((prev) => [...prev, newItem]);
    setContextUrl("");
    setShowContextInput(false);

    // Simulate processing
    setTimeout(() => {
      setContextItems((prev) =>
        prev.map((item) =>
          item.id === newItem.id
            ? { ...item, status: "ready", title: `Context: ${url}` }
            : item
        )
      );
    }, 1000);
  };

  // Remove context item
  const removeContextItem = (id: string) => {
    setContextItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Handle escape key to exit editing session completely
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && editingSessionActive) {
        // FIXED: End the entire editing session on escape, not just full screen
        endEditingSession();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [editingSessionActive]);

  const canEdit = campaign.metadata.status?.value === "Draft";

  return (
    <div
      className={`${
        isFullScreen ? "fixed inset-0 z-50 bg-white overflow-y-auto" : ""
      }`}
    >
      <Card className="border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5" />
              <span>Campaign Content</span>
            </CardTitle>
            <div className="flex items-center space-x-2">
              {/* Create Template Button - Show in read-only mode when content exists */}
              {!editingSessionActive && (displayData.subject && displayData.content) && (
                <Button
                  onClick={() => setShowCreateTemplateDialog(true)}
                  variant="outline"
                  size="sm"
                  disabled={isCreatingTemplate}
                  className="text-blue-600 border-blue-600 hover:bg-blue-50"
                >
                  <BookTemplate className="h-4 w-4 mr-2" />
                  {isCreatingTemplate ? "Creating..." : "Create Template"}
                </Button>
              )}
              
              {!editingSessionActive && canEdit && (
                <Button
                  onClick={startEditingSession}
                  variant="outline"
                  size="sm"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Content
                </Button>
              )}
              {editingSessionActive && isFullScreen && (
                <Button
                  onClick={handleCloseFullScreen}
                  variant="outline"
                  size="sm"
                  className="text-gray-600"
                  title="Close editor and return to read-only view"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          {!canEdit && (
            <p className="text-sm text-yellow-600 bg-yellow-50 p-2 rounded">
              Campaign content can only be edited when status is Draft
            </p>
          )}
        </CardHeader>

        <CardContent className={isFullScreen ? "min-h-screen" : ""}>
          {editingSessionActive ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Error/Success Messages */}
              {error && (
                <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-md">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span className="text-red-700 text-sm">{error}</span>
                </div>
              )}

              {success && (
                <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-md">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-green-700 text-sm">{success}</span>
                </div>
              )}

              {/* Subject Line with AI Generation */}
              <div className="space-y-2">
                <Label htmlFor="subject">Subject Line</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="subject"
                    type="text"
                    value={formData.subject}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        subject: e.target.value,
                      }))
                    }
                    placeholder="Enter email subject line"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    onClick={handleGenerateSubject}
                    disabled={isGeneratingSubject || !formData.content.trim()}
                    variant="outline"
                    size="sm"
                    className="flex items-center space-x-2 text-purple-600 border-purple-300 hover:bg-purple-50"
                    title="Generate subject line from content using AI"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>{isGeneratingSubject ? "Generating..." : "AI Subject"}</span>
                  </Button>
                </div>
                <p className="text-xs text-gray-600">
                  💡 Tip: Add content first, then click "AI Subject" to generate a subject line
                </p>
              </div>

              {/* Main Content Editor - 1/3 2/3 Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - AI Editor (1/3 width) */}
                <div className="space-y-4">
                  <Card className="bg-purple-50/50 border-purple-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-center space-x-2">
                        <Wand2 className="h-5 w-5 text-purple-600" />
                        <CardTitle className="text-lg text-purple-800">
                          AI Content Editor
                        </CardTitle>
                      </div>
                      <p className="text-sm text-purple-700">
                        Describe changes you want to make to your campaign
                        content
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* AI Prompt Input */}
                      <div className="space-y-2">
                        <Label htmlFor="ai-prompt" className="text-purple-800">
                          Instructions for AI
                        </Label>
                        <Textarea
                          id="ai-prompt"
                          ref={aiPromptRef}
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          placeholder="e.g., Make the tone more professional, add a call-to-action button, improve the headline..."
                          className="min-h-[120px] resize-none border-purple-200 focus:border-purple-400"
                          disabled={isAIEditing}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault();
                              handleAIEdit();
                            }
                          }}
                        />
                        <p className="text-xs text-purple-600">
                          💡 Press Cmd/Ctrl + Enter to apply changes
                        </p>
                      </div>

                      {/* Context Management */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-purple-800">
                            Reference Context
                          </Label>
                          <Button
                            type="button"
                            onClick={() =>
                              setShowContextInput(!showContextInput)
                            }
                            variant="outline"
                            size="sm"
                            disabled={isAIEditing}
                            className="border-purple-300 text-purple-700 hover:bg-purple-50"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Context
                          </Button>
                        </div>

                        {/* Context Input */}
                        {showContextInput && (
                          <div className="space-y-2">
                            <Input
                              value={contextUrl}
                              onChange={(e) => setContextUrl(e.target.value)}
                              placeholder="Enter URL or file path for context..."
                              className="border-purple-200"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addContextItem(contextUrl);
                                } else if (e.key === "Escape") {
                                  setShowContextInput(false);
                                  setContextUrl("");
                                }
                              }}
                            />
                            <div className="flex space-x-2">
                              <Button
                                type="button"
                                onClick={() => addContextItem(contextUrl)}
                                size="sm"
                                disabled={!contextUrl.trim()}
                                className="bg-purple-600 hover:bg-purple-700"
                              >
                                Add
                              </Button>
                              <Button
                                type="button"
                                onClick={() => {
                                  setShowContextInput(false);
                                  setContextUrl("");
                                }}
                                size="sm"
                                variant="outline"
                                className="border-purple-300"
                              >
                                Cancel
                              </Button>
                            </div>
                            <p className="text-xs text-purple-600 mt-2">
                              📎 Add style guides, brand references, or web
                              pages for AI to follow
                            </p>
                          </div>
                        )}

                        {/* Context Items List */}
                        {contextItems.length > 0 && (
                          <div className="space-y-2">
                            {contextItems.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between p-2 bg-white border border-purple-200 rounded-md"
                              >
                                <div className="flex items-center space-x-2 flex-1 min-w-0">
                                  {item.type === "webpage" ? (
                                    <Globe className="h-4 w-4 text-blue-500" />
                                  ) : (
                                    <File className="h-4 w-4 text-gray-500" />
                                  )}
                                  <span className="text-sm text-purple-700 truncate">
                                    {item.title || item.url}
                                  </span>
                                  <span className="text-xs text-purple-500 capitalize">
                                    ({item.type})
                                  </span>
                                </div>
                                <Button
                                  type="button"
                                  onClick={() => removeContextItem(item.id)}
                                  disabled={isAIEditing}
                                  size="sm"
                                  variant="ghost"
                                  className="text-purple-400 hover:text-red-600 p-1"
                                >
                                  ×
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}

                        <p className="text-xs text-purple-600">
                          📎 AI will use context items as reference for
                          improvements
                        </p>
                      </div>

                      {/* AI Edit Status Display */}
                      {isAIEditing && aiStatus && (
                        <div className="p-3 bg-purple-100 border border-purple-200 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-purple-800">
                              {aiStatus}
                            </span>
                            <span className="text-xs text-purple-600">
                              {aiProgress}%
                            </span>
                          </div>
                          <div className="w-full bg-purple-200 rounded-full h-2">
                            <div
                              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${aiProgress}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      <Button
                        onClick={handleAIEdit}
                        disabled={isAIEditing || !aiPrompt.trim()}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        {isAIEditing ? (
                          <>Editing with AI...</>
                        ) : (
                          <>
                            <Wand2 className="mr-2 h-4 w-4" />
                            Edit with AI
                          </>
                        )}
                      </Button>

                      {/* Editing session help */}
                      {editingSessionActive && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-start space-x-2">
                            <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                            <div className="text-sm text-blue-800">
                              <p className="font-medium mb-1">
                                Iterative Editing Mode
                              </p>
                              <p className="text-xs">
                                Keep adding refinement instructions to perfect
                                your campaign. Context and previous changes are
                                preserved.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Right Column - HTML Content Editor (2/3 width) */}
                <ContentEditor
                  content={formData.content}
                  subject={formData.subject}
                  templateType={formData.template_type}
                  isAIEditing={isAIEditing}
                  streamingContent={streamingContent}
                  onContentChange={handleContentChange}
                />
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-between pt-6 border-t">
                <Button
                  type="button"
                  onClick={() => endEditingSession()}
                  variant="outline"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>

                <div className="flex items-center space-x-3">
                  {hasUnsavedChanges && (
                    <span className="text-sm text-amber-600 flex items-center">
                      <Info className="h-4 w-4 mr-1" />
                      Unsaved changes
                    </span>
                  )}

                  <Button
                    type="submit"
                    disabled={isSubmitting || isAIEditing}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Campaign Content
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            /* CRITICAL: Read-only view uses displayData - NEVER changes during editing */
            <div className="space-y-6">
              {/* Subject Preview - Shows displayData, not formData */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  Subject Line
                </Label>
                <div className="p-3 bg-gray-50 rounded-md border text-sm">
                  {displayData.subject || "No subject line"}
                </div>
              </div>

              {/* Content Preview - Shows displayData, not formData */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  Email Content
                </Label>
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 border-b">
                    <span className="text-xs font-medium text-gray-600">
                      Campaign Content Preview (Read Only)
                    </span>
                  </div>
                  <div
                    className="p-4 max-h-96 overflow-y-auto bg-white"
                    dangerouslySetInnerHTML={{
                      __html: displayData.content || "No content",
                    }}
                    style={{
                      fontFamily: "system-ui, -apple-system, sans-serif",
                      lineHeight: "1.5",
                    }}
                  />
                </div>
              </div>

              {/* Show Create Template suggestion if content exists and no templates created yet */}
              {(displayData.subject && displayData.content) && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <BookTemplate className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-blue-900">
                        Save as Template
                      </h4>
                      <p className="text-sm text-blue-700 mt-1">
                        Turn this campaign content into a reusable template for future campaigns.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Template Dialog */}
      <CreateTemplateDialog
        isOpen={showCreateTemplateDialog}
        onClose={() => setShowCreateTemplateDialog(false)}
        onSave={handleCreateTemplate}
        defaultSubject={displayData.subject}
      />
    </div>
  );
}