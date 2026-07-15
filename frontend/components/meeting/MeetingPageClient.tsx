'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { meetingsApi, usersApi } from '@/lib/api'
import { MeetingCallView } from './MeetingCallView'
import { useAuth } from '@/hooks/useAuth'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useMembers } from '@/hooks/useMembers'

export default function MeetingPageClient({ meetingId }: { meetingId: string }) {
	const router = useRouter()
	const { backendUser } = useAuth()
	const [meeting, setMeeting] = useState<any | null>(null)
	const [loading, setLoading] = useState(true)

	const { members } = useMembers(meeting?.workspaceId)
	const [externalProfiles, setExternalProfiles] = useState<any[]>([])

	// Subscribe to meeting presence events so the UI reflects joins/leaves
	useWebSocket({
		onMeetingParticipants: (evt) => {
			if (evt.meetingId !== meetingId) return
			setMeeting((m) => {
				if (!m) return m
				const existing = new Set((m.participants ?? []).map((p: any) => p.userId))
				const additions = evt.userIds.filter((id) => !existing.has(id)).map((id) => ({ userId: id }))
				if (additions.length === 0) return m
				return { ...m, participants: [...(m.participants ?? []), ...additions] }
			})
		},
		onMeetingUserJoined: (evt) => {
			if (evt.meetingId !== meetingId) return
			setMeeting((m) => {
				if (!m) return m
				const exists = (m.participants ?? []).some((p: any) => p.userId === evt.userId && !p.leftAt)
				if (exists) return m
				return { ...m, participants: [...(m.participants ?? []), { userId: evt.userId }] }
			})
		},
		onMeetingUserLeft: (evt) => {
			if (evt.meetingId !== meetingId) return
			setMeeting((m) => {
				if (!m) return m
				return { ...m, participants: (m.participants ?? []).map((p: any) => p.userId === evt.userId ? { ...p, leftAt: new Date().toISOString() } : p) }
			})
		},
	})

	useEffect(() => {
		let mounted = true
		const load = async () => {
			try {
				const res = await meetingsApi.getOne(meetingId)
				if (!mounted) return
				setMeeting(res.data)
			} catch (err) {
				console.error('[MeetingPage] failed to load meeting', err)
				// If not found or forbidden, navigate back to meetings list
				router.replace('/app/meetings')
			} finally {
				if (mounted) setLoading(false)
			}
		}
		load()
		return () => { mounted = false }
	}, [meetingId, router])

	// Fetch external user profiles for participants when workspace members
	// are not available (public meetings). We store them in
	// `externalProfiles` with shape { userId, user: { firstName, lastName, email, avatarUrl } }
	useEffect(() => {
		let mounted = true
		const loadProfiles = async () => {
			if (!meeting) return
			const ids = Array.from(new Set((meeting.participants ?? []).map((p: any) => p.userId)))
			const missing = ids.filter((id) => !(members ?? []).some((m: any) => m.userId === id))
			if (missing.length === 0) {
				if (mounted) setExternalProfiles([])
				return
			}
			try {
				const profiles = await Promise.all(missing.map((id) => usersApi.getById(id).then(r => ({ userId: id, user: r.data })).catch(() => null)))
				if (!mounted) return
				setExternalProfiles(profiles.filter(Boolean))
			} catch (err) {
				console.error('Failed to load external participant profiles', err)
			}
		}
		loadProfiles()
		return () => { mounted = false }
	}, [meeting, members])

	const participants = useMemo(() => {
		if (!meeting) return []
		// Map server participants (meeting.participants) -> MeetingCallView Participant shape
		return (meeting.participants ?? []).filter((p: any) => !p.leftAt).map((p: any) => {
			const member = (members ?? []).find((m: any) => m.userId === p.userId) ?? externalProfiles.find((x: any) => x.userId === p.userId)
			const name = member ? `${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim() || 'User' : (p.userId === meeting.hostId ? (meeting.host?.firstName ? `${meeting.host.firstName} ${meeting.host.lastName || ''}`.trim() : 'Host') : 'User')
			return {
				id: p.userId,
				name,
				initials: (name?.[0] ?? 'U').toUpperCase(),
				color: '#4361EE',
				isSelf: backendUser?.id === p.userId,
				cameraOff: p.cameraEnabled === false,
				isMuted: !!p.isMuted,
				isHost: (p.role ?? '').toString().toLowerCase() === 'host',
			}
		})
	}, [meeting, members, backendUser, externalProfiles])

	if (loading) return <div className="min-h-screen flex items-center justify-center text-white">Loading…</div>
	if (!meeting) return null

	return (
		<MeetingCallView
			meetingId={meeting.id}
			meetingCode={meeting.code}
			title={meeting.title}
			participants={participants}
			workspaceMembers={members ?? []}
			currentUserId={backendUser?.id}
			onLeave={() => router.replace('/app/meetings')}
		/>
	)
}
