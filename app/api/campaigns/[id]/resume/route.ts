// app/api/campaigns/[id]/resume/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cosmic } from '@/lib/cosmic'
import { revalidatePath } from 'next/cache'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Update campaign status to sending to resume processing
    const { object } = await cosmic.objects.updateOne(id, {
      metadata: {
        status: { key: 'sending', value: 'Sending' },
        retry_count: 0 // Reset retry count when manually resuming
      }
    })

    // Revalidate the campaign page
    revalidatePath(`/campaigns/${id}`)
    revalidatePath('/campaigns')

    return NextResponse.json({ 
      success: true, 
      message: 'Campaign resumed successfully',
      campaign: object 
    })
  } catch (error) {
    console.error('Error resuming campaign:', error)
    return NextResponse.json(
      { error: 'Failed to resume campaign' },
      { status: 500 }
    )
  }
}