export interface StoredFile {
  id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  entity_type: string;
  entity_id: string | null;
  step_index: number | null;
  uploaded_by: string;
  created_at: string;
  url: string | null;
}
