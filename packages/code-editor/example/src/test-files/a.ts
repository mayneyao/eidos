// File a.ts - references file b.ts
import type {
  User,
  UserWithRole} from './b';
import {
  UserService,
  UserRole,
  createDefaultUser
} from './b';

// Test ESM import functionality
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

// Test syntax highlighting and type checking
class UserManager {
  private userService: UserService;
  private currentUser: User | null = null;

  constructor() {
    this.userService = new UserService();
    this.currentUser = createDefaultUser();
  }

  /**
   * Initialize user manager
   */
  async initialize(): Promise<void> {
    console.log("Initializing user manager...");

    // Test code completion - typing this.userService. should show method hints
    const users = this.userService.getAllUsers();
    console.log("Current user count:", users.length);

    // Test type checking - should have type hints here
    users.forEach((user: User) => {
      console.log(`User: ${user.name}, Email: ${user.email}`);

      // Test optional properties
      if (user.age) {
        console.log(`Age: ${user.age}`);
      }
    });
  }

  /**
   * Create user with role
   */
  createUserWithRole(userData: Omit<User, 'id'>, role: UserRole): UserWithRole {
    const user = this.userService.addUser(userData);

    // Test enum types and union types
    const permissions = this.getPermissionsByRole(role);

    return {
      ...user,
      role,
      permissions
    };
  }

  /**
   * Get permissions by role
   */
  private getPermissionsByRole(role: UserRole): string[] {
    switch (role) {
      case UserRole.ADMIN:
        return ['read', 'write', 'delete', 'manage'];
      case UserRole.USER:
        return ['read', 'write'];
      case UserRole.GUEST:
        return ['read'];
      default:
        // Should have type checking error hint here
        return [];
    }
  }

  /**
   * Search users
   */
  searchUsers(query: string): User[] {
    const allUsers = this.userService.getAllUsers();

    return allUsers.filter(user =>
      user.name.toLowerCase().includes(query.toLowerCase()) ||
      user.email.toLowerCase().includes(query.toLowerCase())
    );
  }

  /**
   * Batch update users
   */
  async batchUpdateUsers(updates: Array<{ id: number; data: Partial<Omit<User, 'id'>> }>): Promise<User[]> {
    const results: User[] = [];

    for (const update of updates) {
      // Test code completion and type checking
      const updatedUser = this.userService.updateUser(update.id, update.data);
      if (updatedUser) {
        results.push(updatedUser);
      }
    }

    return results;
  }

  /**
   * Get user statistics
   */
  getUserStats(): { total: number; withAge: number; averageAge: number; reportId: string; timestamp: string } {
    const users = this.userService.getAllUsers();
    const usersWithAge = users.filter(user => user.age !== undefined);

    const averageAge = usersWithAge.length > 0
      ? usersWithAge.reduce((sum, user) => sum + (user.age || 0), 0) / usersWithAge.length
      : 0;

    return {
      total: users.length,
      withAge: usersWithAge.length,
      averageAge: Math.round(averageAge * 100) / 100,
      reportId: uuidv4(), // Use uuid to generate unique ID
      timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss') // Use date-fns to format time
    };
  }

  /**
   * Create user activity log
   */
  createActivityLog(userId: number, action: string): { id: string; userId: number; action: string; timestamp: string } {
    return {
      id: uuidv4(),
      userId,
      action,
      timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
    };
  }

  /**
   * Get formatted user information
   */
  getFormattedUserInfo(user: User): string {
    const createdAt = new Date();
    return `User ${user.name} (ID: ${user.id}) - Created on ${format(createdAt, 'yyyy-MM-dd')}`;
  }

  /**
   * Perform debounced search
   */
  performDebouncedSearch(query: string): void {
    this.userService.searchUsers(query);
  }

  /**
   * Fetch users from remote API
   */
  async fetchRemoteUsers(endpoint: string): Promise<User[]> {
    return this.userService.fetchUsersFromAPI(endpoint);
  }
}

// Test code
export const testUserManager = async () => {
  const manager = new UserManager();
  await manager.initialize();

  // Test creating user
  const newUser = manager.createUserWithRole(
    { name: "John Doe", email: "john@example.com", age: 28 },
    UserRole.USER
  );

  console.log("Created user:", newUser);
  console.log("Formatted user info:", manager.getFormattedUserInfo(newUser));

  // Test search
  const searchResults = manager.searchUsers("John");
  console.log("Search results:", searchResults);

  // Test statistics (including UUID and formatted time)
  const stats = manager.getUserStats();
  console.log("User statistics:", stats);

  // Test activity log
  const activityLog = manager.createActivityLog(newUser.id, "User created");
  console.log("Activity log:", activityLog);

  // Test ESM import debounced search functionality
  manager.performDebouncedSearch("test query");

  // Test remote API functionality
  try {
    const remoteUsers = await manager.fetchRemoteUsers('/api/users');
    console.log("Remote user data:", remoteUsers);
  } catch (error) {
    console.log("Remote API test (expected to fail):", error);
  }
};

// Export for use by other files
export { UserManager };
export default UserManager;
