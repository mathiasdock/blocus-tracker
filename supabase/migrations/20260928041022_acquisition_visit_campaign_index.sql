-- Cover the campaign foreign key used by the generic visit registry.
create index if not exists acquisition_visits_campaign_slug_idx
  on public.acquisition_visits (campaign_slug);
