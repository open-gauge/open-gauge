export interface ProcedureStep {
  title: string;
  description: string | null;
  duration_min: number | null;
}

export interface ProcedureEquipmentItem {
  name: string;
  model: string | null;
}

export interface ProcedureMaterialItem {
  name: string;
  quantity: string | null;
}

export interface ProcedureEnvironmentItem {
  parameter: string;
  value: string;
}

export interface ProcedureAcceptanceCriterion {
  label: string;
  limit: string;
}

export interface Procedure {
  id: string;
  proc_id: string | null;
  physical_quantity: string;
  name: string;
  description: string | null;
  version: string;
  difficulty: string | null;
  standard_ref: string | null;
  author: string | null;
  duration_min: number | null;
  tags: string[] | null;
  equipment: ProcedureEquipmentItem[] | null;
  materials: ProcedureMaterialItem[] | null;
  environment: ProcedureEnvironmentItem[] | null;
  safety_notes: string[] | null;
  steps: ProcedureStep[] | null;
  acceptance_criteria: ProcedureAcceptanceCriterion[] | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProcedureCreateBody {
  proc_id: string;
  physical_quantity: string;
  name: string;
  description?: string | null;
  version?: string;
  difficulty?: string | null;
  standard_ref?: string | null;
  author?: string | null;
  duration_min?: number | null;
  tags?: string[] | null;
  equipment?: ProcedureEquipmentItem[] | null;
  materials?: ProcedureMaterialItem[] | null;
  environment?: ProcedureEnvironmentItem[] | null;
  safety_notes?: string[] | null;
  steps?: ProcedureStep[] | null;
  acceptance_criteria?: ProcedureAcceptanceCriterion[] | null;
}
