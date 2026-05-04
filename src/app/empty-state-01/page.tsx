import EmptyState from '@/components/shadcn-studio/blocks/empty-state-01/empty-state-01'

const EmptyStatePage = () => {
  return (
    <div className='py-8 sm:py-16 lg:py-24'>
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        <div className='flex justify-center'>
          <EmptyState />
        </div>
      </div>
    </div>
  )
}

export default EmptyStatePage
