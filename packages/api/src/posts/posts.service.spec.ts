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

  describe('updatePost', () => {
    it('lets the author edit their own post', async () => {
      const postsChain = createQueryChain({ data: { ...POST, content: 'Nouveau contenu', status: 'EDITED' }, error: null });
      const service = new PostsService(createSupabaseServiceMock({ posts: postsChain }) as never);

      const result = await service.updatePost('post-1', 'user-1', 'Nouveau contenu', false);

      expect(postsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Nouveau contenu', status: 'EDITED' }),
      );
      expect(result.status).toBe('EDITED');
    });

    it('lets a Responsable+ edit someone else\'s post', async () => {
      const postsChain = createQueryChain({ data: { ...POST, status: 'EDITED' }, error: null });
      const service = new PostsService(createSupabaseServiceMock({ posts: postsChain }) as never);

      await expect(service.updatePost('post-1', 'moderator-1', 'Modifié', true)).resolves.toBeDefined();
    });

    it('rejects a non-author without community.manage', async () => {
      const service = new PostsService(createSupabaseServiceMock({ posts: createQueryChain({ data: POST, error: null }) }) as never);

      await expect(service.updatePost('post-1', 'outsider', 'x', false)).rejects.toThrow(
        'Only the author or a Responsable+ can edit this post',
      );
    });
  });

  describe('archivePost', () => {
    it('soft-deletes and marks ARCHIVED', async () => {
      const postsChain = createQueryChain({ data: POST, error: null });
      const service = new PostsService(createSupabaseServiceMock({ posts: postsChain }) as never);

      await service.archivePost('post-1', 'user-1', false);

      expect(postsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ARCHIVED', deleted_at: expect.any(String) }),
      );
    });

    it('rejects a non-author without community.manage', async () => {
      const service = new PostsService(createSupabaseServiceMock({ posts: createQueryChain({ data: POST, error: null }) }) as never);

      await expect(service.archivePost('post-1', 'outsider', false)).rejects.toThrow(
        'Only the author or a Responsable+ can archive this post',
      );
    });
  });

  describe('findCommentById', () => {
    it('throws NotFoundException for a missing or soft-deleted comment', async () => {
      const service = new PostsService(createSupabaseServiceMock({ comments: createQueryChain({ data: null, error: null }) }) as never);

      await expect(service.findCommentById('missing')).rejects.toThrow('Comment missing not found');
    });
  });

  describe('updateComment', () => {
    const COMMENT = { id: 'comment-1', post_id: 'post-1', author_id: 'user-2', content: 'Amen', status: 'CREATED' };

    it('lets the author edit their own comment', async () => {
      const commentsChain = createQueryChain({ data: { ...COMMENT, content: 'Amen !', status: 'EDITED' }, error: null });
      const service = new PostsService(createSupabaseServiceMock({ comments: commentsChain }) as never);

      const result = await service.updateComment('comment-1', 'user-2', 'Amen !');

      expect(result.status).toBe('EDITED');
    });

    it('rejects anyone but the author, including a moderator', async () => {
      const service = new PostsService(createSupabaseServiceMock({ comments: createQueryChain({ data: COMMENT, error: null }) }) as never);

      await expect(service.updateComment('comment-1', 'moderator-1', 'x')).rejects.toThrow(
        'Only the author can edit this comment',
      );
    });
  });

  describe('deleteComment', () => {
    const COMMENT = { id: 'comment-1', post_id: 'post-1', author_id: 'user-2', content: 'Amen', status: 'CREATED' };

    it('lets the author delete their own comment', async () => {
      const commentsChain = createQueryChain({ data: COMMENT, error: null });
      const service = new PostsService(createSupabaseServiceMock({ comments: commentsChain }) as never);

      await service.deleteComment('comment-1', 'user-2', false);

      expect(commentsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'DELETED', deleted_at: expect.any(String) }),
      );
    });

    it('lets a Modérateur+ delete someone else\'s comment', async () => {
      const commentsChain = createQueryChain({ data: COMMENT, error: null });
      const service = new PostsService(createSupabaseServiceMock({ comments: commentsChain }) as never);

      await expect(service.deleteComment('comment-1', 'moderator-1', true)).resolves.toBeUndefined();
    });

    it('rejects a non-author without post.moderate', async () => {
      const service = new PostsService(createSupabaseServiceMock({ comments: createQueryChain({ data: COMMENT, error: null }) }) as never);

      await expect(service.deleteComment('comment-1', 'outsider', false)).rejects.toThrow(
        'Only the author or a Modérateur+ can delete this comment',
      );
    });
  });
});
