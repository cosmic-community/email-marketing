'use client'

import { Card } from '@/components/ui/card'
import { Users, Mail, Send, TrendingUp, Eye, MousePointer, UserX, Calendar } from 'lucide-react'
import { formatNumber, formatPercentage } from '@/lib/utils'

export interface DashboardStatsProps {
  totalCampaigns: number
  totalContacts: number
  activeContacts: number
  totalTemplates: number
  sentCampaigns: number
  scheduledCampaigns: number
  totalEmailsSent: number
  averageOpenRate: string
}

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  description?: string
  trend?: {
    value: number
    isPositive: boolean
  }
}

function StatCard({ title, value, icon, description, trend }: StatCardProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {description && (
              <p className="text-xs text-gray-500 mt-1">{description}</p>
            )}
          </div>
        </div>
        {trend && (
          <div className={`flex items-center ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
            <TrendingUp className={`h-4 w-4 ${trend.isPositive ? '' : 'rotate-180'}`} />
            <span className="text-sm font-medium ml-1">{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>
    </Card>
  )
}

export default function DashboardStats({
  totalCampaigns,
  totalContacts,
  activeContacts,
  totalTemplates,
  sentCampaigns,
  scheduledCampaigns,
  totalEmailsSent,
  averageOpenRate
}: DashboardStatsProps) {
  const activeContactsPercentage = totalContacts > 0 
    ? ((activeContacts / totalContacts) * 100).toFixed(1) 
    : '0'

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard
        title="Total Contacts"
        value={formatNumber(totalContacts)}
        icon={<Users className="h-5 w-5 text-blue-600" />}
        description={`${formatNumber(activeContacts)} active (${activeContactsPercentage}%)`}
      />
      
      <StatCard
        title="Total Campaigns"
        value={formatNumber(totalCampaigns)}
        icon={<Mail className="h-5 w-5 text-blue-600" />}
        description={`${formatNumber(sentCampaigns)} sent, ${formatNumber(scheduledCampaigns)} scheduled`}
      />
      
      <StatCard
        title="Email Templates"
        value={formatNumber(totalTemplates)}
        icon={<Send className="h-5 w-5 text-blue-600" />}
        description="Ready to use templates"
      />
      
      <StatCard
        title="Average Open Rate"
        value={averageOpenRate}
        icon={<Eye className="h-5 w-5 text-blue-600" />}
        description={`${formatNumber(totalEmailsSent)} emails sent total`}
      />
    </div>
  )
}