'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TemplateType } from '@/types'

export default function CreateTemplateForm() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [aiGeneratedContent, setAiGeneratedContent] = useState('')
  const [aiGeneratedSubject, setAiGeneratedSubject] = useState('')
  const [hasGeneratedContent, setHasGeneratedContent] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    content: '',
    template_type: 'Newsletter' as TemplateType,
    active: true
  })

  const [aiPrompt, setAiPrompt] = useState('')
  const [aiTemplateType, setAiTemplateType] = useState<TemplateType>('Newsletter')
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return
    
    setIsGeneratingAI(true)
    setError('')
    
    try {
      const response = await fetch('/api/templates/generate-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: aiPrompt,
          template_type: aiTemplateType
        }),
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate template')
      }

      setAiGeneratedContent(result.content)
      setAiGeneratedSubject(result.subject)
      setFormData(prev => ({
        ...prev,
        content: result.content,
        subject: result.subject,
        name: result.name || prev.name,
        template_type: aiTemplateType
      }))
      
      // Hide the generator after first generation
      setHasGeneratedContent(true)
      
    } catch (err) {
      console.error('AI Generation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate template')
    } finally {
      setIsGeneratingAI(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create template')
      }

      router.push('/templates')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleStartOver = () => {
    setHasGeneratedContent(false)
    setAiGeneratedContent('')
    setAiGeneratedSubject('')
    setAiPrompt('')
    setFormData({
      name: '',
      subject: '',
      content: '',
      template_type: 'Newsletter' as TemplateType,
      active: true
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* AI Content Generator - Only show if no content has been generated */}
        {!hasGeneratedContent && (
          <div className="card mb-8">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900">AI Content Generator</h2>
            </div>
            <p className="text-gray-600 mb-6">Describe what you want to create with Cosmic AI</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Template Type
                </label>
                <select
                  className="form-input"
                  value={aiTemplateType}
                  onChange={(e) => setAiTemplateType(e.target.value as TemplateType)}
                >
                  <option value="Newsletter">Newsletter</option>
                  <option value="Welcome Email">Welcome Email</option>
                  <option value="Promotional">Promotional</option>
                  <option value="Transactional">Transactional</option>
                </select>
              </div>

              <div>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder="e.g., 'Create a welcome email for new customers joining our fitness app'"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                />
              </div>

              <button
                type="button"
                onClick={handleAIGenerate}
                disabled={isGeneratingAI || !aiPrompt.trim()}
                className="btn-primary w-full sm:w-auto flex items-center justify-center"
              >
                {isGeneratingAI ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating with Cosmic AI...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Generate with Cosmic AI
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* AI Content Editor - Only show if content has been generated */}
        {hasGeneratedContent && aiGeneratedContent && (
          <div className="card mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900">AI Content Editor</h2>
              </div>
              <button
                type="button"
                onClick={handleStartOver}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Start Over
              </button>
            </div>
            <p className="text-gray-600 mb-6">How should we improve the current content?</p>
            
            <form className="space-y-4">
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="e.g., 'Make it cosmic blue like the Cosmic CMS website', 'Add a call-to-action button'"
              />
              
              <button
                type="button"
                className="btn-secondary flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit with AI
              </button>
            </form>
          </div>
        )}

        {/* Main Template Form */}
        <div className="card">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Template Details</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Template Name
              </label>
              <input
                type="text"
                id="name"
                required
                className="form-input"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter template name"
              />
            </div>

            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
                Email Subject
              </label>
              <input
                type="text"
                id="subject"
                required
                className="form-input"
                value={formData.subject}
                onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Enter email subject line"
              />
            </div>

            <div>
              <label htmlFor="template_type" className="block text-sm font-medium text-gray-700 mb-2">
                Template Type
              </label>
              <select
                id="template_type"
                className="form-input"
                value={formData.template_type}
                onChange={(e) => setFormData(prev => ({ ...prev, template_type: e.target.value as TemplateType }))}
              >
                <option value="Newsletter">Newsletter</option>
                <option value="Welcome Email">Welcome Email</option>
                <option value="Promotional">Promotional</option>
                <option value="Transactional">Transactional</option>
              </select>
            </div>

            <div>
              <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
                Email Content (HTML)
              </label>
              <textarea
                id="content"
                required
                rows={12}
                className="form-textarea"
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Enter your HTML email content..."
              />
              <p className="text-sm text-gray-500 mt-2">
                Use template variables like {`{{first_name}}`} and {`{{last_name}}`} for personalization.
              </p>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="active"
                className="form-checkbox"
                checked={formData.active}
                onChange={(e) => setFormData(prev => ({ ...prev, active: e.target.checked }))}
              />
              <label htmlFor="active" className="ml-2 text-sm text-gray-700">
                Template is active and ready to use
              </label>
            </div>

            <div className="flex space-x-4 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={() => router.back()}
                className="btn-secondary"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isLoading}
              >
                {isLoading ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}