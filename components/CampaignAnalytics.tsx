'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  BarChart3, 
  Eye, 
  MousePointer, 
  Send, 
  Users, 
  TrendingUp,
  Calendar,
  Mail,
  ExternalLink,
  Clock
} from 'lucide-react'

interface CampaignAnalyticsProps {
  campaignId: string
  campaignName: string
}

interface Analytics {
  campaignId: string
  totalSent: number
  totalOpened: number
  totalClicked: number
  openRate: string
  clickRate: string
  openedContactDetails: Array<{
    id: string
    email: string
    firstName: string
    lastName: string
  }>
  clickedContactDetails: Array<{
    id: string
    email: string
    firstName: string
    lastName: string
  }>
  trackingEvents: Array<{
    id: string
    type: string
    contactId: string
    timestamp: string
    clickedUrl?: string
  }>
  engagement: {
    totalEngagement: number
    engagementRate: string
  }
  timeline: Array<{
    date: string
    opens: number
    clicks: number
  }>
}

export default function CampaignAnalytics({ campaignId, campaignName }: CampaignAnalyticsProps) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setIsLoading(true)
        const response = await fetch(`/api/campaigns/${campaignId}/analytics`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch analytics')
        }

        const result = await response.json()
        if (result.success) {
          setAnalytics(result.analytics)
        } else {
          throw new Error(result.error || 'Failed to load analytics')
        }
      } catch (error) {
        console.error('Analytics error:', error)
        setError(error instanceof Error ? error.message : 'Failed to load analytics')
      } finally {
        setIsLoading(false)
      }
    }

    fetchAnalytics()
    
    // Refresh analytics every 30 seconds
    const interval = setInterval(fetchAnalytics, 30000)
    return () => clearInterval(interval)
  }, [campaignId])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-8 bg-gray-200 rounded mb-2"></div>
                <div className="h-6 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="p-6">
          <div className="text-center text-red-600">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">Analytics Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!analytics) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Campaign Analytics</h2>
          <p className="text-gray-600">{campaignName}</p>
        </div>
        <Badge variant="outline" className="flex items-center space-x-2">
          <TrendingUp className="h-4 w-4" />
          <span>Live Tracking</span>
        </Badge>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Send className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{analytics.totalSent}</p>
                <p className="text-sm text-gray-600">Emails Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Eye className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{analytics.totalOpened}</p>
                <p className="text-sm text-gray-600">
                  Opens ({analytics.openRate})
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <MousePointer className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{analytics.totalClicked}</p>
                <p className="text-sm text-gray-600">
                  Clicks ({analytics.clickRate})
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{analytics.engagement.totalEngagement}</p>
                <p className="text-sm text-gray-600">
                  Engagement ({analytics.engagement.engagementRate})
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="opened">Opened</TabsTrigger>
          <TabsTrigger value="clicked">Clicked</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5" />
                  <span>Performance Summary</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Open Rate</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full" 
                        style={{ width: analytics.openRate }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium">{analytics.openRate}</span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Click Rate</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-purple-600 h-2 rounded-full" 
                        style={{ width: analytics.clickRate }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium">{analytics.clickRate}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Engagement Rate</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-orange-600 h-2 rounded-full" 
                        style={{ width: analytics.engagement.engagementRate }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium">{analytics.engagement.engagementRate}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Unique Opens</span>
                  <span className="font-medium">{analytics.openedContactDetails.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Unique Clicks</span>
                  <span className="font-medium">{analytics.clickedContactDetails.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Events</span>
                  <span className="font-medium">{analytics.trackingEvents.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Delivery Rate</span>
                  <span className="font-medium">
                    {analytics.totalSent > 0 ? '100%' : '0%'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="opened" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Eye className="h-5 w-5 text-green-600" />
                <span>Contacts Who Opened</span>
                <Badge variant="outline">{analytics.openedContactDetails.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.openedContactDetails.length > 0 ? (
                <div className="space-y-2">
                  {analytics.openedContactDetails.map((contact) => (
                    <div key={contact.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center space-x-3">
                        <Mail className="h-4 w-4 text-green-600" />
                        <div>
                          <p className="font-medium text-gray-900">
                            {contact.firstName} {contact.lastName}
                          </p>
                          <p className="text-sm text-gray-600">{contact.email}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                        Opened
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Eye className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>No opens recorded yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clicked" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MousePointer className="h-5 w-5 text-purple-600" />
                <span>Contacts Who Clicked</span>
                <Badge variant="outline">{analytics.clickedContactDetails.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.clickedContactDetails.length > 0 ? (
                <div className="space-y-2">
                  {analytics.clickedContactDetails.map((contact) => (
                    <div key={contact.id} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <div className="flex items-center space-x-3">
                        <MousePointer className="h-4 w-4 text-purple-600" />
                        <div>
                          <p className="font-medium text-gray-900">
                            {contact.firstName} {contact.lastName}
                          </p>
                          <p className="text-sm text-gray-600">{contact.email}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-300">
                        Clicked
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <MousePointer className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>No clicks recorded yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Click Events Detail */}
          {analytics.trackingEvents.filter(e => e.type === 'click').length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <ExternalLink className="h-5 w-5" />
                  <span>Click Events</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analytics.trackingEvents
                    .filter(event => event.type === 'click')
                    .map((event) => {
                      const contact = analytics.clickedContactDetails.find(c => c.id === event.contactId)
                      return (
                        <div key={event.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <Clock className="h-4 w-4 text-gray-500" />
                            <div>
                              <p className="text-sm font-medium">
                                {contact?.email || event.contactId}
                              </p>
                              <p className="text-xs text-gray-500">
                                {new Date(event.timestamp).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-blue-600 truncate max-w-48">
                              {event.clickedUrl}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5" />
                <span>Engagement Timeline</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.timeline.length > 0 ? (
                <div className="space-y-3">
                  {analytics.timeline.map((day) => (
                    <div key={day.date} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <span className="font-medium">
                          {new Date(day.date).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <Eye className="h-4 w-4 text-green-600" />
                          <span className="text-sm">{day.opens} opens</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <MousePointer className="h-4 w-4 text-purple-600" />
                          <span className="text-sm">{day.clicks} clicks</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>No engagement data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}