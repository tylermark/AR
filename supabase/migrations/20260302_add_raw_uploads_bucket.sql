-- Create private raw-uploads bucket for direct client-side uploads.
-- Files are moved to the 'models' bucket after server-side processing.

insert into storage.buckets (id, name, public, file_size_limit)
values ('raw-uploads', 'raw-uploads', false, 200000000);

create policy "Users can upload to own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'raw-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can read own uploads"
on storage.objects for select
to authenticated
using (
  bucket_id = 'raw-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);
