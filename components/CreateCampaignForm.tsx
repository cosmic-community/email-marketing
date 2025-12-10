'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { EmailTemplate, EmailContact, EmailList } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Plus, Calendar, Users, Tag, Mail, Share, ExternalLink, Search, X, Eye, EyeOff } from 'lucide-react'

interface CreateCampaignFormProps {
  templates: EmailTemplate[]
  lists: EmailList[]
  initialTemplateId?: string
  initialSendDate?: string
}

export default function CreateCampaignForm({
  templates,
  lists,
  initialTemplateId,
  initialSendDate
}: CreateCampaignFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  
  // Contact search state
  const [contactSearchTerm, setContactSearchTerm] = useState('')
  const [searchedContacts, setSearchedContacts] = useState<EmailContact[]>([])
  const [isSearchingContacts, setIsSearchingContacts] = useState(false)
  
  // Tag search state  
  const [tagSearchTerm, setTagSearchTerm] = useState('')
  const [availableTags, setAvailableTags] = useState<string[]>([])
  
  const [formData, setFormData] = useState({
    name: '',
    template_id: initialTemplateId || '',
    target_type: 'lists' as 'lists' | 'contacts' | 'tags',
    list_ids: [] as string[],
    contact_ids: [] as string[],
    target_tags: [] as string[],
    send_date: initialSendDate || '',
    schedule_type: initialSendDate ? 'scheduled' as 'now' | 'scheduled' : 'now' as 'now' | 'scheduled',
    public_sharing_enabled: true // Default to true for new campaigns
  })

  // Find selected template for preview
  const selectedTemplate = templates.find(t => t.id === formData.template_id)

  // Search contacts with debouncing
  const searchContacts = useCallback(async (term: string) => {
    if (term.length < 2) {
      setSearchedContacts([])
      return
    }

    setIsSearchingContacts(true)
    try {
      const response = await fetch(`/api/contacts?search=${encodeURIComponent(term)}&limit=20`)
      const data = await response.json()
      
      if (data.success) {
        setSearchedContacts(data.data.contacts)
      }
    } catch (error) {
      console.error('Error searching contacts:', error)
    } finally {
      setIsSearchingContacts(false)
    }
  }, [])

  // Debounce contact search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (contactSearchTerm) {
        searchContacts(contactSearchTerm)
      } else {
        setSearchedContacts([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [contactSearchTerm, searchContacts])

  // Search for available tags
  const searchTags = useCallback(async (term: string) => {
    if (term.length < 2) {
      setAvailableTags([])
      return
    }

    try {
      const response = await fetch(`/api/contacts/tags?search=${encodeURIComponent(term)}`)
      const data = await response.json()
      
      if (data.success) {
        setAvailableTags(data.tags)
      }
    } catch (error) {
      console.error('Error searching tags:', error)
    }
  }, [])

  // Debounce tag search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (tagSearchTerm) {
        searchTags(tagSearchTerm)
      } else {
        setAvailableTags([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [tagSearchTerm, searchTags])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Validate form
      if (!formData.name.trim()) {
        toast({
          title: "Validation Error",
          description: "Campaign name is required",
          variant: "destructive",
        })
        return
      }

      if (!formData.template_id) {
        toast({
          title: "Validation Error", 
          description: "Please select an email template",
          variant: "destructive",
        })
        return
      }

      // Validate target audience
      if (formData.target_type === 'lists' && formData.list_ids.length === 0) {
        toast({
          title: "Validation Error",
          description: "Please select at least one email list",
          variant: "destructive",
        })
        return
      }

      if (formData.target_type === 'contacts' && formData.contact_ids.length === 0) {
        toast({
          title: "Validation Error", 
          description: "Please select at least one contact",
          variant: "destructive",
        })
        return
      }

      if (formData.target_type === 'tags' && formData.target_tags.length === 0) {
        toast({
          title: "Validation Error",
          description: "Please add at least one tag",
          variant: "destructive",
        })
        return
      }

      // Validate scheduled send date
      if (formData.schedule_type === 'scheduled') {
        if (!formData.send_date) {
          toast({
            title: "Validation Error",
            description: "Please select a send date for scheduled campaigns",
            variant: "destructive",
          })
          return
        }

        const sendDate = new Date(formData.send_date)
        const now = new Date()
        if (sendDate <= now) {
          toast({
            title: "Validation Error",
            description: "Send date must be in the future",
            variant: "destructive",
          })
          return
        }
      }

      // Create campaign
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          template_id: formData.template_id,
          subject: selectedTemplate?.metadata.subject || '',
          content: selectedTemplate?.metadata.content || '',
          list_ids: formData.target_type === 'lists' ? formData.list_ids : undefined,
          contact_ids: formData.target_type === 'contacts' ? formData.contact_ids : undefined,
          target_tags: formData.target_type === 'tags' ? formData.target_tags : undefined,
          send_date: formData.schedule_type === 'scheduled' ? formData.send_date : '',
          public_sharing_enabled: formData.public_sharing_enabled,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create campaign')
      }

      toast({
        title: "Success!",
        description: "Campaign created successfully",
      })

      // Redirect to campaign details
      router.push(`/campaigns/${data.data.id}`)
    } catch (error) {
      console.error('Campaign creation error:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create campaign",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleListToggle = (listId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      list_ids: checked 
        ? [...prev.list_ids, listId]
        : prev.list_ids.filter(id => id !== listId)
    }))
  }

  // Changed: Added function to select all lists
  const handleSelectAllLists = () => {
    setFormData(prev => ({
      ...prev,
      list_ids: lists.map(list => list.id)
    }))
  }

  // Changed: Added function to deselect all lists
  const handleDeselectAllLists = () => {
    setFormData(prev => ({
      ...prev,
      list_ids: []
    }))
  }

  const handleContactToggle = (contactId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      contact_ids: checked
        ? [...prev.contact_ids, contactId]
        : prev.contact_ids.filter(id => id !== contactId)
    }))
  }

  const handleTagAdd = (tag: string) => {
    if (!formData.target_tags.includes(tag)) {
      setFormData(prev => ({
        ...prev,
        target_tags: [...prev.target_tags, tag]
      }))
      setTagSearchTerm('')
      setAvailableTags([])
    }
  }

  const handleTagRemove = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      target_tags: prev.target_tags.filter(tag => tag !== tagToRemove)
    }))
  }

  const getSelectedCount = () => {
    if (formData.target_type === 'lists') {
      return formData.list_ids.length
    } else if (formData.target_type === 'contacts') {
      return formData.contact_ids.length
    } else if (formData.target_type === 'tags') {
      return formData.target_tags.length
    }
    return 0
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Campaign Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Campaign Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="name">Campaign Name *</Label>
                  <Input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter campaign name"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="template">Email Template *</Label>
                  <Select 
                    value={formData.template_id} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, template_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map(template => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.metadata.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Public Sharing */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
                  <div className="flex items-center gap-3">
                    <Share className="w-5 h-5 text-gray-600" />
                    <div>
                      <Label htmlFor="public-sharing" className="text-sm font-medium">
                        Enable Public Sharing
                      </Label>
                      <p className="text-sm text-gray-600">
                        Allow public access via shareable link
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="public-sharing"
                    checked={formData.public_sharing_enabled}
                    onCheckedChange={(checked) => setFormData(prev => ({ 
                      ...prev, 
                      public_sharing_enabled: checked 
                    }))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Target Audience */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Target Audience
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Target Type *</Label>
                  <Select
                    value={formData.target_type}
                    onValueChange={(value: 'lists' | 'contacts' | 'tags') => 
                      setFormData(prev => ({ ...prev, target_type: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lists">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          <span>Email Lists</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="contacts">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          <span>Individual Contacts</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="tags">
                        <div className="flex items-center gap-2">
                          <Tag className="w-4 h-4" />
                          <span>Contact Tags</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Lists Selection */}
                {formData.target_type === 'lists' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Select Email Lists</Label>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {formData.list_ids.length} selected
                        </Badge>
                        {/* Changed: Added Select All / Deselect All buttons */}
                        {lists.length > 0 && (
                          <div className="flex gap-2">
                            {formData.list_ids.length === lists.length ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleDeselectAllLists}
                                className="h-7 text-xs"
                              >
                                Deselect All
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleSelectAllLists}
                                className="h-7 text-xs"
                              >
                                Select All
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {lists.length === 0 ? (
                      <p className="text-sm text-gray-500 py-8 text-center">
                        No email lists available. Create a list first.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {lists.map((list) => (
                          <div key={list.id} className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50">
                            <Checkbox
                              id={`list-${list.id}`}
                              checked={formData.list_ids.includes(list.id)}
                              onCheckedChange={(checked) => handleListToggle(list.id, checked as boolean)}
                            />
                            <label htmlFor={`list-${list.id}`} className="flex-1 cursor-pointer">
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
                {formData.target_type === 'contacts' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Search & Select Contacts</Label>
                      <Badge variant="outline">
                        {formData.contact_ids.length} selected
                      </Badge>
                    </div>
                    
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        value={contactSearchTerm}
                        onChange={(e) => setContactSearchTerm(e.target.value)}
                        placeholder="Search contacts by name or email..."
                        className="pl-10"
                      />
                      {isSearchingContacts && (
                        <div className="absolute right-3 top-3">
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                        </div>
                      )}
                    </div>

                    {/* Search Results */}
                    {searchedContacts.length > 0 && (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {searchedContacts
                          .filter(contact => contact.metadata.status.value === 'Active')
                          .map((contact) => (
                          <div key={contact.id} className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50">
                            <Checkbox
                              id={`contact-${contact.id}`}
                              checked={formData.contact_ids.includes(contact.id)}
                              onCheckedChange={(checked) => handleContactToggle(contact.id, checked as boolean)}
                            />
                            <label htmlFor={`contact-${contact.id}`} className="flex-1 cursor-pointer">
                              <div className="font-medium">
                                {contact.metadata.first_name} {contact.metadata.last_name}
                              </div>
                              <div className="text-sm text-gray-500">{contact.metadata.email}</div>
                            </label>
                          </div>
                        ))}
                      </div>
                    )}

                    {contactSearchTerm && contactSearchTerm.length >= 2 && !isSearchingContacts && searchedContacts.length === 0 && (
                      <p className="text-sm text-gray-500 py-4 text-center">
                        No contacts found for "{contactSearchTerm}"
                      </p>
                    )}
                  </div>
                )}

                {/* Tags Selection */}
                {formData.target_type === 'tags' && (
                  <div className="space-y-3">
                    <Label>Target Tags</Label>
                    
                    <div className="relative">
                      <Input
                        value={tagSearchTerm}
                        onChange={(e) => setTagSearchTerm(e.target.value)}
                        placeholder="Search for tags..."
                      />
                    </div>

                    {/* Available Tags */}
                    {availableTags.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm text-gray-600">Available Tags</Label>
                        <div className="flex flex-wrap gap-2">
                          {availableTags.map(tag => (
                            <Button
                              key={tag}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleTagAdd(tag)}
                              disabled={formData.target_tags.includes(tag)}
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              {tag}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Selected Tags */}
                    {formData.target_tags.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm text-gray-600">Selected Tags</Label>
                        <div className="flex flex-wrap gap-2">
                          {formData.target_tags.map(tag => (
                            <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                              {tag}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-4 w-4 p-0 hover:bg-transparent"
                                onClick={() => handleTagRemove(tag)}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Schedule Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Schedule Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Send Schedule</Label>
                  <Select
                    value={formData.schedule_type}
                    onValueChange={(value: 'now' | 'scheduled') => 
                      setFormData(prev => ({ ...prev, schedule_type: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="now">Send immediately</SelectItem>
                      <SelectItem value="scheduled">Schedule for later</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.schedule_type === 'scheduled' && (
                  <div>
                    <Label htmlFor="send-date">Send Date & Time</Label>
                    <Input
                      id="send-date"
                      type="datetime-local"
                      value={formData.send_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, send_date: e.target.value }))}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Preview Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-8">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    Preview
                  </span>
                  {selectedTemplate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPreview(!showPreview)}
                    >
                      {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedTemplate ? (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-600">Template</Label>
                      <p className="text-sm font-medium">{selectedTemplate.metadata.name}</p>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium text-gray-600">Subject</Label>
                      <p className="text-sm">{selectedTemplate.metadata.subject}</p>
                    </div>

                    {showPreview && (
                      <div>
                        <Label className="text-sm font-medium text-gray-600">Content Preview</Label>
                        <div 
                          className="text-xs p-3 bg-gray-50 rounded-lg max-h-64 overflow-y-auto"
                          dangerouslySetInnerHTML={{ 
                            __html: selectedTemplate.metadata.content.substring(0, 500) + '...' 
                          }}
                        />
                      </div>
                    )}

                    {getSelectedCount() > 0 && (
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <div className="text-sm font-medium text-blue-800">
                          Target Summary
                        </div>
                        <div className="text-sm text-blue-600">
                          {getSelectedCount()} {formData.target_type} selected
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    Select a template to see preview
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <Button 
            type="submit" 
            disabled={isLoading || !formData.name || !formData.template_id || getSelectedCount() === 0}
            className="px-8"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Create Campaign
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}