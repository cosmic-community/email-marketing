'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

interface PaginationControlsProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
}

export default function PaginationControls({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage
}: PaginationControlsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateURL = (page: number, limit?: number) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()))
    
    if (page === 1) {
      current.delete('page')
    } else {
      current.set('page', page.toString())
    }

    if (limit && limit !== 25) {
      current.set('limit', limit.toString())
    } else {
      current.delete('limit')
    }

    const search = current.toString()
    const query = search ? `?${search}` : ''
    
    router.push(`/contacts${query}`)
  }

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      updateURL(page)
    }
  }

  const handleLimitChange = (limit: string) => {
    updateURL(1, parseInt(limit))
  }

  // Calculate pagination display range
  const getVisiblePageNumbers = () => {
    const delta = 2
    const range = []
    const rangeWithDots = []

    // Always include first page
    range.push(1)

    // Calculate the range around current page
    for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
      range.push(i)
    }

    // Always include last page if there's more than 1 page
    if (totalPages > 1) {
      range.push(totalPages)
    }

    let prev = 0
    for (const page of range) {
      if (page - prev === 2) {
        rangeWithDots.push(prev + 1)
      } else if (page - prev > 2) {
        rangeWithDots.push('...')
      }
      rangeWithDots.push(page)
      prev = page
    }

    return rangeWithDots
  }

  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  if (totalPages <= 1) {
    return null
  }

  return (
    <div className="bg-white px-6 py-4 border border-gray-200 rounded-lg shadow-sm">
      <div className="flex items-center justify-between">
        {/* Results info */}
        <div className="flex items-center space-x-4">
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{startItem}</span> to{' '}
            <span className="font-medium">{endItem}</span> of{' '}
            <span className="font-medium">{totalItems}</span> results
          </p>
          
          {/* Items per page selector */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-700">Show:</span>
            <Select value={itemsPerPage.toString()} onValueChange={handleLimitChange}>
              <SelectTrigger className="w-20 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Pagination controls */}
        <div className="flex items-center space-x-2">
          {/* First page */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(1)}
            disabled={currentPage === 1}
            className="h-8 w-8 p-0"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>

          {/* Previous page */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Page numbers */}
          <div className="flex space-x-1">
            {getVisiblePageNumbers().map((page, index) => (
              <div key={index}>
                {page === '...' ? (
                  <span className="px-3 py-1 text-gray-500">...</span>
                ) : (
                  <Button
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePageChange(page as number)}
                    className="h-8 w-8 p-0"
                  >
                    {page}
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Next page */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Last page */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(totalPages)}
            disabled={currentPage === totalPages}
            className="h-8 w-8 p-0"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}