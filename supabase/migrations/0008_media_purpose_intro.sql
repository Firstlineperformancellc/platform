-- Mentors' intro videos are Mux assets too. (ADD VALUE must run in its own batch.)
alter type public.media_purpose add value if not exists 'intro_video';
