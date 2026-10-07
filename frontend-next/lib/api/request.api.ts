import api from "./axios";

export interface MeetingRequestSummary {
  id: string;
  request_id: string;
  meeting_type: string;
  recurrence_type: "RECURRING" | "NON_RECURRING";
  recurrence_end_at?: string | null;
  recurrence_days: number[];
  start_at: string;
  end_at: string;
  timezone: string;
  location?: string | null;
  meeting_url?: string | null;
  status: string;
  request: { id: string; request_number: string; title: string; description: string; priority: string; status: string; assignee_user_id?: string | null } | null;
}

export interface MeetingDetail extends MeetingRequestSummary {
  organizer_user_id: string;
  notetaker_user_id?: string | null;
  notetaker?: { id: string; full_name: string; email: string } | null;
  permissions?: { can_edit_minutes: boolean; can_publish: boolean; can_delete?: boolean };
  selected_occurrence_date: string;
  notes: Array<{ occurrence_date: string; minutes_id: string | null; status: "NOT_CREATED" | "DRAFT" | "COMPLETED"; is_today?: boolean }>;
  participants: Array<{ id: string; user_id?: string | null; participant_role: string; invitation_status: string; attendance_status: string; user?: { id: string; full_name: string; email: string } | null }>;
  agenda: Array<{ id: string; sequence_number: number; title: string; description?: string | null; status: string }>;
  minutes: null | {
    id: string; occurrence_date: string; status: string; summary: string; opening_notes: string; general_discussion: string; conclusion: string;
    decisions: Array<{ id: string; decision_text: string; owner_user_id?: string | null }>;
    action_items: Array<{ id: string; title: string; description: string; assignee_user_id?: string | null; due_at?: string | null; priority: string; status: string }>;
  };
}

export interface CreateMeetingInput {
  title: string; description?: string; start_at: string; end_at: string; location?: string; meeting_url?: string;
  meeting_type?: string; notetaker_user_id?: string; tagged_users?: Array<{ id: string; name: string }>;
  recurrence_type?: "RECURRING" | "NON_RECURRING"; recurrence_end_at?: string; recurrence_days?: number[];
  assignee_user_id?: string;
  agenda_items?: Array<{ title: string }>;
  is_draft?: boolean;
}

export interface SaveMinutesInput {
  occurrence_date: string;
  summary: string; opening_notes?: string; general_discussion: string; conclusion?: string;
  decisions: Array<{ text: string }>;
  action_items: Array<{ title: string; description?: string; assignee_user_id?: string; due_at?: string; priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT" }>;
}

export interface NonMeetingRequest {
  id: string;
  request_number: string;
  request_type: 'LEAVE' | 'OTHER' | 'FUND_REQUEST';
  title: string;
  description: string;
  status: string;
  priority: string;
  created_by_id: string;
  assignee_user_id: string | null;
  assignee_user: { id: string; name: string; email: string } | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  company_id: string | null;
}

export interface CreateNonMeetingInput {
  request_type: 'LEAVE' | 'OTHER';
  title: string;
  description?: string;
  start_at?: string;
  end_at?: string;
  assignee_user_id?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  is_draft?: boolean;
}

export const requestApi = {
  listTeamMembers: async () => (await api.get<Array<{ id: string; name: string; email: string; role: string }>>("/api/v1/requests/team-members")).data,
  listMeetings: async () => (await api.get<MeetingRequestSummary[]>("/api/v1/requests/meetings")).data,
  getMeeting: async (id: string, occurrenceDate?: string) => (await api.get<MeetingDetail>(`/api/v1/requests/meetings/${id}`, { params: occurrenceDate ? { date: occurrenceDate } : undefined })).data,
  createMeeting: async (input: CreateMeetingInput) => (await api.post("/api/v1/requests/meetings", input)).data,
  deleteMeeting: async (id: string) => { await api.delete(`/api/v1/requests/meetings/${id}`); },
  saveMinutes: async (id: string, input: SaveMinutesInput) => (await api.put<MeetingDetail>(`/api/v1/requests/meetings/${id}/minutes`, input)).data,
  publishMinutes: async (id: string, occurrenceDate: string) => (await api.post<MeetingDetail>(`/api/v1/requests/meetings/${id}/minutes/publish`, { occurrence_date: occurrenceDate })).data,
  submitDraftMeeting: async (meetingId: string) => {
    const res = await api.post<MeetingDetail | { success: true; data: MeetingDetail }>(`/api/v1/requests/meetings/${meetingId}/submit`);
    const data = res.data;
    return (data && typeof data === 'object' && 'data' in data) ? (data as { data: MeetingDetail }).data : data as MeetingDetail;
  },
  assignRequest: async (requestId: string, assigneeUserId: string) => (await api.patch(`/api/v1/requests/${requestId}/assignee`, { assignee_user_id: assigneeUserId })).data,

  // Non-meeting requests: Leave & Other
  listNonMeetingRequests: async (page = 1) => {
    type RequestFeed = { total: number; rows: NonMeetingRequest[] };
    type RequestFeedResponse = RequestFeed | { success: true; data: RequestFeed };
    const [leaveResponse, otherResponse] = await Promise.all([
      api.get<RequestFeedResponse>("/api/v1/requests", { params: { type: 'LEAVE', page, pageSize: 50 } }),
      api.get<RequestFeedResponse>("/api/v1/requests", { params: { type: 'OTHER', page, pageSize: 50 } }),
    ]);
    const unwrap = (payload: RequestFeedResponse): RequestFeed => 'data' in payload ? payload.data : payload;
    const leave = unwrap(leaveResponse.data);
    const other = unwrap(otherResponse.data);
    return {
      total: leave.total + other.total,
      rows: [...leave.rows, ...other.rows]
        .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()),
    };
  },
  createNonMeetingRequest: async (payload: CreateNonMeetingInput) =>
    (await api.post("/api/v1/requests", payload)).data,
};
