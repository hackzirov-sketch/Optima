import MeetingPageClient from '@/components/meeting/MeetingPageClient'

type Props = { params: { id: string } }

export default async function Page({ params }: Props) {
	const { id } = await params
	return <MeetingPageClient meetingId={id} />
}
