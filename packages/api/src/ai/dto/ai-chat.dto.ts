import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

class ChatHistoryTurnDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(2000)
  content!: string;
}

export class AiChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  // Client-resent transcript so far — this backend is stateless per request, no server-side
  // conversation storage. Capped so a chat can't be used to smuggle an unbounded prompt.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryTurnDto)
  history?: ChatHistoryTurnDto[];
}
