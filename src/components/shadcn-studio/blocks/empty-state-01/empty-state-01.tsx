import { ChartNoAxesColumnIncreasingIcon } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function EmptyState() {
  return (
    <Card className='w-full max-w-lg'>
      <CardHeader className='gap-0'>
        <CardDescription>Total API requests.</CardDescription>
        <CardTitle className='text-3xl'>0</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='rounded-md border border-dashed p-6 text-center'>
          <ChartNoAxesColumnIncreasingIcon className='text-muted-foreground mx-auto size-12' />
          <p className='mt-2 text-sm font-medium'>No data to show</p>
          <p className='text-muted-foreground mt-1 text-sm'>May take 24 hours for data to load</p>
        </div>
      </CardContent>
    </Card>
  )
}

export default EmptyState
