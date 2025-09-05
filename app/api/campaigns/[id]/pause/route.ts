// app/api/campaigns/[id]/pause/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cosmic } from '@/lib/cosmic'
import { revalidatePath } from 'next/cache'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Update campaign status to paused
    const { object } = await cosmic.objects.updateOne(id, {
      metadata: {
        status: { key: 'paused', value: 'Paused' }
      }
    })

    // Revalidate the campaign page
    revalidatePath(`/campaigns/${id}`)
    revalidatePath('/campaigns')

    return NextResponse.json({ 
      success: true, 
      message: 'Campaign paused successfully',
      campaign: object 
    })
  } catch (error) {
    console.error('Error pausing campaign:', error)
    return NextResponse.json(
      { error: 'Failed to pause campaign' },
      { status: 500 }
    )
  }
}