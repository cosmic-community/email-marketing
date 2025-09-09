import { Card } from '@/components/ui/card'
import { Users, Mail, Send, TrendingUp, Eye, MousePointer } from 'lucide-react'

interface StatsData {
  totalCampaigns: number;
  totalContacts: number;
  activeContacts: number;
  totalTemplates: number;
  sentCampaigns: number;
  scheduledCampaigns: number;
  totalEmailsSent: number;
  averageOpenRate: string;
}

interface DashboardStatsProps {
  totalCampaigns: number;
  totalContacts: number;
  activeContacts: number;
  totalTemplates: number;
  sentCampaigns: number;
  scheduledCampaigns: number;
  totalEmailsSent: number;
  averageOpenRate: string;
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
  const stats = [
    {
      title: 'Total Contacts',
      value: totalContacts.toLocaleString(),
      icon: Users,
      description: `${activeContacts} active`,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      title: 'Email Templates',
      value: totalTemplates.toLocaleString(),
      icon: Mail,
      description: 'Ready to use',
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      title: 'Campaigns',
      value: totalCampaigns.toLocaleString(),
      icon: Send,
      description: `${sentCampaigns} sent, ${scheduledCampaigns} scheduled`,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      title: 'Emails Sent',
      value: totalEmailsSent.toLocaleString(),
      icon: TrendingUp,
      description: 'Total delivered',
      color: 'text-orange-600',
      bgColor: 'bg-orange-100'
    },
    {
      title: 'Average Open Rate',
      value: averageOpenRate,
      icon: Eye,
      description: 'Across all campaigns',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-100'
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
      {stats.map((stat, index) => (
        <Card key={index} className="p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center">
            <div className={`p-2 rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`h-6 w-6 ${stat.color}`} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">{stat.title}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.description}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}