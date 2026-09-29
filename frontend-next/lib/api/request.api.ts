import api from "./axios";

export interface MeetingRequestSummary {
  id: string;
  request_id: string;
  meeting_type: string;
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
  participants: Array<{ id: string; user_id?: string | null; participant_role: string; invitation_status: string; attendance_status: string; user?: { id: string; full_name: string; email: string } | null }>;
  agenda: Array<{ id: string; sequence_number: number; title: string; description?: string | null; status: string }>;
  minutes: null | {
    id: string; status: string; summary: string; opening_notes: string; general_discussion: string; conclusion: string;
    decisions: Array<{ id: string; decision_text: string; owner_user_id?: string | null }>;
    action_items: Array<{ id: string; title: string; description: string; assignee_user_id?: string | null; due_at?: string | null; priority: string; status: string }>;
  };
}

export interface CreateMeetingInput {
  title: string; description?: string; start_at: string; end_at: string; location?: string; meeting_url?: string;
  meeting_type?: string; notetaker_user_id?: string; tagged_users?: Array<{ id: string; name: string }>;
  assignee_user_id?: string;
  agenda_items?: Array<{ title: string }>;
  is_draft?: boolean;
}

export interface SaveMinutesInput {
  summary: string; opening_notes?: string; general_discussion: string; conclusion?: string;
  decisions: Array<{ text: string }>;
  action_items: Array<{ title: string; description?: string; assignee_user_id?: string; due_at?: string; priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT" }>;
}

export const requestApi = {
  listTeamMembers: async () => (await api.get<Array<{ id: string; name: string; email: string; role: string }>>("/api/v1/requests/team-members")).data,
  listMeetings: async () => (await api.get<MeetingRequestSummary[]>("/api/v1/requests/meetings")).data,
  getMeeting: async (id: string) => (await api.get<MeetingDetail>(`/api/v1/requests/meetings/${id}`)).data,
  createMeeting: async (input: CreateMeetingInput) => (await api.post("/api/v1/requests/meetings", input)).data,
  saveMinutes: async (id: string, input: SaveMinutesInput) => (await api.put<MeetingDetail>(`/api/v1/requests/meetings/${id}/minutes`, input)).data,
  publishMinutes: async (id: string) => (await api.post<MeetingDetail>(`/api/v1/requests/meetings/${id}/minutes/publish`)).data,
  assignRequest: async (requestId: string, assigneeUserId: string) => (await api.patch(`/api/v1/requests/${requestId}/assignee`, { assignee_user_id: assigneeUserId })).data,
};
