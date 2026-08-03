REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_manager(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;