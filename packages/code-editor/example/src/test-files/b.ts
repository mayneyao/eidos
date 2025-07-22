// 文件 b.ts - 被引用的文件
// 测试 ESM 导入功能
import { debounce } from 'lodash-es';
import axios from 'axios';

export interface User {
  id: number;
  name: string;
  email: string;
  age?: number;
}

export class UserService {
  private users: User[] = [];
  private debouncedSearch: (query: string) => void;

  constructor() {
    this.users = [
      { id: 1, name: "张三", email: "zhangsan@example.com", age: 25 },
      { id: 2, name: "李四", email: "lisi@example.com", age: 30 }
    ];

    // 使用 lodash-es 的 debounce 函数
    this.debouncedSearch = debounce(this.performSearch.bind(this), 300);
  }

  private performSearch(query: string): void {
    console.log('Performing search for:', query);
  }

  /**
   * 获取所有用户
   * @returns 用户列表
   */
  getAllUsers(): User[] {
    return this.users;
  }

  /**
   * 根据ID获取用户
   * @param id 用户ID
   * @returns 用户对象或undefined
   */
  getUserById(id: number): User | undefined {
    return this.users.find(user => user.id === id);
  }

  /**
   * 添加新用户
   * @param user 用户信息
   */
  addUser(user: Omit<User, 'id'>): User {
    const newUser: User = {
      id: Math.max(...this.users.map(u => u.id)) + 1,
      ...user
    };
    this.users.push(newUser);
    return newUser;
  }

  /**
   * 更新用户信息
   * @param id 用户ID
   * @param updates 要更新的字段
   */
  updateUser(id: number, updates: Partial<Omit<User, 'id'>>): User | null {
    const userIndex = this.users.findIndex(user => user.id === id);
    if (userIndex === -1) {
      return null;
    }
    
    this.users[userIndex] = { ...this.users[userIndex], ...updates };
    return this.users[userIndex];
  }

  /**
   * 删除用户
   * @param id 用户ID
   */
  deleteUser(id: number): boolean {
    const userIndex = this.users.findIndex(user => user.id === id);
    if (userIndex === -1) {
      return false;
    }

    this.users.splice(userIndex, 1);
    return true;
  }

  /**
   * 搜索用户（防抖）
   * @param query 搜索关键词
   */
  searchUsers(query: string): void {
    this.debouncedSearch(query);
  }

  /**
   * 从远程 API 获取用户数据
   * @param endpoint API 端点
   */
  async fetchUsersFromAPI(endpoint: string): Promise<User[]> {
    try {
      const response = await axios.get<User[]>(endpoint);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch users from API:', error);
      return [];
    }
  }

  /**
   * 同步用户数据到远程服务器
   * @param user 用户数据
   */
  async syncUserToServer(user: User): Promise<boolean> {
    try {
      await axios.post('/api/users', user);
      return true;
    } catch (error) {
      console.error('Failed to sync user to server:', error);
      return false;
    }
  }
}

export const createDefaultUser = (): User => ({
  id: 0,
  name: "默认用户",
  email: "default@example.com"
});

export enum UserRole {
  ADMIN = "admin",
  USER = "user",
  GUEST = "guest"
}

export type UserWithRole = User & {
  role: UserRole;
  permissions: string[];
};
