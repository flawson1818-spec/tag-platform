import { PostsService } from './posts.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

const POST = {
  id: 'post-1',
  community_id: 'community-1',
  author_id: 'user-1',
  content: 'Prions ensemble',
  status: 'PUBLISHED',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
};

describe('PostsService', () => {
  describe('createPost', () => {
    it('rejects a non-member', async () => {
      const supabase = createSupabaseServiceMock({
        community_members: createQueryChain({ data: null, error: null }),
      });
      const service = new PostsService(supabase as never);

      await expect(service.createPost('community-1', 'outsider', { content: 'hi' } as never)).rejects.toThrow(
        'Only community members can post',
      );
    });

    it('inserts the post for a member', async () => {
      const postsChain = createQueryChain({ data: POST, error: null });
      const supabase = createSupabaseServiceMock({
        community_members: createQueryChain({ data: { community_id: 'community-1' }, error: null }),
        posts: postsChain,
      });
      const service = new PostsService(supabase as never);

      const result = await service.createPost('community-1', 'user-1', { content: 'Prions ensemble' } as never);

      expect(postsChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Prions ensemble', status: 'PUBLISHED' }),
      );
      expect(result).toEqual(POST);
    });
  });

  describe('findPostById', () => {
    it('throws NotFoundException for a missing or soft-deleted post', async () => {
      const supabase = createSupabaseServiceMock({
        posts: createQueryChain({ data: null, error: null }),
      });
      const service = new PostsService(supabase as never);

      await expect(service.findPostById('missing')).rejects.toThrow('Post missing not found');
    });
  });

  describe('createComment', () => {
    it('rejects when the post does not exist', async () => {
      const supabase = createSupabaseServiceMock({
        posts: createQueryChain({ data: null, error: null }),
      });
      const service = new PostsService(supabase as never);

      await expect(
        service.createComment('missing', 'user-1', { content: 'Amen' } as never),
      ).rejects.toThrow('Post missing not found');
    });

    it('rejects a non-member of the post community', async () => {
      const supabase = createSupabaseServiceMock({
        posts: createQueryChain({ data: POST, error: null }),
        community_members: createQueryChain({ data: null, error: null }),
      });
      const service = new PostsService(supabase as never);

      await expect(
        service.createComment('post-1', 'outsider', { content: 'Amen' } as never),
      ).rejects.toThrow('Only community members can comment');
    });

    it('inserts the comment for a member of the post community', async () => {
      const commentsChain = createQueryChain({
        data: { id: 'comment-1', post_id: 'post-1', author_id: 'user-2', content: 'Amen', status: 'CREATED' },
        error: null,
      });
      const supabase = createSupabaseServiceMock({
        posts: createQueryChain({ data: POST, error: null }),
        community_members: createQueryChain({ data: { community_id: 'community-1' }, error: null }),
        comments: commentsChain,
      });
      const service = new PostsService(supabase as never);

      const result = await service.createComment('post-1', 'user-2', { content: 'Amen' } as never);

      expect(commentsChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ post_id: 'post-1', author_id: 'user-2', content: 'Amen' }),
      );
      expect(result.content).toBe('Amen');
    });
  });

  describe('listComments', () => {
    it('checks the post exists before listing', async () => {
      const supabase = createSupabaseServiceMock({
        posts: createQueryChain({ data: null, error: null }),
      });
      const service = new PostsService(supabase as never);

      await expect(service.listComments('missing', {} as never)).rejects.toThrow('Post missing not found');
    });
  });
});
