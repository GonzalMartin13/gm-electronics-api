CREATE TABLE gm.deployment_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  git_commit text,
  status text NOT NULL CHECK (status IN ('passed','failed')),
  report jsonb NOT NULL
);

