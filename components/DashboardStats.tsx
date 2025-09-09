import { Card } from '@/components/ui/card'
import { LucideIcon } from 'lucide-react'

interface StatItem {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bgColor?: string;
}

interface DashboardStatsProps {
  stats: StatItem[];
}

export default function DashboardStats({ stats }: DashboardStatsProps) {
  // Add default bgColor for stats that don't have it
  const statsWithBgColor = stats.map(stat => ({
    ...stat,
    bgColor: stat.bgColor || getBgColorFromTextColor(stat.color)
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statsWithBgColor.map((stat, index) => (
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

// Helper function to generate background colors from text colors
function getBgColorFromTextColor(textColor: string): string {
  const colorMap: Record<string, string> = {
    'text-blue-600': 'bg-blue-100',
    'text-green-600': 'bg-green-100',
    'text-purple-600': 'bg-purple-100',
    'text-orange-600': 'bg-orange-100',
    'text-indigo-600': 'bg-indigo-100',
    'text-red-600': 'bg-red-100',
    'text-yellow-600': 'bg-yellow-100',
    'text-pink-600': 'bg-pink-100',
    'text-gray-600': 'bg-gray-100'
  };
  
  return colorMap[textColor] || 'bg-gray-100';
}