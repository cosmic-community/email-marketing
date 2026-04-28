import { NextResponse } from 'next/server'

// Force dynamic rendering since this route accesses environment variables at request time
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  return NextResponse.json({
    bucketSlug: process.env.COSMIC_BUCKET_SLUG
  })
}